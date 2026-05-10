<?php
// ============================================================================
// Interview Revision Hub — chat sync API
// Stores all conversations in data/chat.json (no database).
// Endpoints (all JSON):
//   POST   api.php?action=login        { user, pass }                -> sets cookie
//   POST   api.php?action=logout
//   GET    api.php?action=state                                      -> { conversations, version, activeId }
//   GET    api.php?action=poll&since=N&timeout=25                    -> long-poll, returns when version > N
//   POST   api.php?action=new          { id, title }
//   POST   api.php?action=append       { id, message:{role,content} }
//   POST   api.php?action=rename       { id, title }
//   POST   api.php?action=delete       { id }
//   POST   api.php?action=setActive    { id }
// ============================================================================

declare(strict_types=1);

// ---- load .env (if present) ----
$_ENV_FILE = __DIR__ . '/.env';
if (is_file($_ENV_FILE)) {
    foreach (file($_ENV_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_line) {
        if ($_line === '' || $_line[0] === '#') continue;
        [$_k, $_v] = array_pad(explode('=', $_line, 2), 2, '');
        $_ENV[trim($_k)] = trim($_v);
    }
}

// ---- config ----
$USERNAME = $_ENV['APP_USERNAME'] ?? 'abdohero';
$PASSWORD = $_ENV['APP_PASSWORD'] ?? 'ABDOwahna135795';
$GROQ_API_KEY  = $_ENV['GROQ_API_KEY']  ?? '';
$GROQ_ENDPOINT = $_ENV['GROQ_ENDPOINT'] ?? 'https://api.groq.com/openai/v1/chat/completions';
$GROQ_MODEL    = $_ENV['GROQ_MODEL']    ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

$DATA_DIR  = __DIR__ . '/data';
$DATA_FILE = $DATA_DIR . '/chat.json';
$LOCK_FILE = $DATA_DIR . '/chat.lock';

// ---- bootstrap ----
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (!is_dir($DATA_DIR)) {
    @mkdir($DATA_DIR, 0775, true);
}
if (!file_exists($DATA_FILE)) {
    file_put_contents($DATA_FILE, json_encode([
        'version'       => 0,
        'activeId'      => null,
        'conversations' => [],
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path'     => '/',
    'httponly' => true,
    'secure'   => false,   // allow over plain HTTP (localhost / XAMPP)
    'samesite' => 'Lax',
]);
// Use a fixed session name so cookies don't get confused across vhosts
session_name('IRH_SESSION');
session_start();

// ---- helpers ----
function jexit(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function load_state(string $file): array {
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return ['version' => 0, 'activeId' => null, 'conversations' => []];
    }
    $d = json_decode($raw, true);
    if (!is_array($d)) {
        return ['version' => 0, 'activeId' => null, 'conversations' => []];
    }
    if (!isset($d['version']))       $d['version'] = 0;
    if (!array_key_exists('activeId', $d)) $d['activeId'] = null;
    if (!isset($d['conversations'])) $d['conversations'] = [];
    return $d;
}

/**
 * Atomically read-modify-write the JSON store under a flock.
 * $mutator($state) must mutate $state and return true if a change was made.
 * Returns the new state.
 */
function with_state_lock(string $file, string $lock, callable $mutator): array {
    $fp = fopen($lock, 'c');
    if (!$fp) jexit(['error' => 'lock open failed'], 500);
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        jexit(['error' => 'lock failed'], 500);
    }
    try {
        $state = load_state($file);
        $changed = (bool) $mutator($state);
        if ($changed) {
            $state['version'] = (int)$state['version'] + 1;
            $tmp = $file . '.tmp';
            file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            rename($tmp, $file);
        }
        return $state;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function require_auth(): void {
    if (empty($_SESSION['auth'])) {
        jexit(['error' => 'unauthorized'], 401);
    }
}

function find_conv(array &$state, string $id): ?int {
    foreach ($state['conversations'] as $i => $c) {
        if (($c['id'] ?? '') === $id) return $i;
    }
    return null;
}

// ---- routing ----
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {
    case 'login': {
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b = read_body();
        $u = (string)($b['user'] ?? '');
        $p = (string)($b['pass'] ?? '');
        if ($u === $USERNAME && $p === $PASSWORD) {
            $_SESSION['auth'] = true;
            jexit(['ok' => true]);
        }
        jexit(['error' => 'bad credentials'], 401);
    }

    case 'logout': {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'] ?? '', $p['secure'], $p['httponly']);
        }
        session_destroy();
        jexit(['ok' => true]);
    }

    case 'state': {
        require_auth();
        $state = load_state($DATA_FILE);
        jexit($state);
    }

    case 'poll': {
        require_auth();
        $since   = isset($_GET['since']) ? (int)$_GET['since'] : 0;
        $timeout = isset($_GET['timeout']) ? max(1, min(30, (int)$_GET['timeout'])) : 25;
        // session_write_close so other concurrent requests from the same client
        // are not blocked by PHP's default per-session lock.
        session_write_close();

        $deadline = microtime(true) + $timeout;
        do {
            $state = load_state($DATA_FILE);
            if ((int)$state['version'] > $since) {
                jexit($state);
            }
            usleep(500_000); // 500ms
        } while (microtime(true) < $deadline);

        // Timed out, no new data
        jexit(['version' => (int)$state['version'], 'noChange' => true]);
    }

    case 'new': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b = read_body();
        $id    = (string)($b['id']    ?? '');
        $title = (string)($b['title'] ?? 'New conversation');
        if ($id === '') jexit(['error' => 'id required'], 400);

        $state = with_state_lock($DATA_FILE, $LOCK_FILE, function (array &$s) use ($id, $title): bool {
            if (find_conv($s, $id) !== null) return false;
            array_unshift($s['conversations'], [
                'id'        => $id,
                'title'     => $title,
                'createdAt' => round(microtime(true) * 1000),
                'messages'  => [],
            ]);
            $s['activeId'] = $id;
            return true;
        });
        jexit($state);
    }

    case 'append': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b = read_body();
        $id  = (string)($b['id'] ?? '');
        $msg = $b['message'] ?? null;
        if ($id === '' || !is_array($msg)) jexit(['error' => 'id and message required'], 400);

        $role    = (string)($msg['role'] ?? '');
        $content = (string)($msg['content'] ?? '');
        if (!in_array($role, ['user', 'assistant', 'system'], true)) {
            jexit(['error' => 'bad role'], 400);
        }

        $state = with_state_lock($DATA_FILE, $LOCK_FILE, function (array &$s) use ($id, $role, $content): bool {
            $i = find_conv($s, $id);
            if ($i === null) {
                array_unshift($s['conversations'], [
                    'id'        => $id,
                    'title'     => $content !== '' ? mb_substr($content, 0, 40) : 'New conversation',
                    'createdAt' => round(microtime(true) * 1000),
                    'messages'  => [],
                ]);
                $i = 0;
                $s['activeId'] = $id;
            }
            $s['conversations'][$i]['messages'][] = [
                'role'    => $role,
                'content' => $content,
                'ts'      => round(microtime(true) * 1000),
            ];
            // Auto-title from first user message
            if ($role === 'user'
                && (($s['conversations'][$i]['title'] ?? '') === ''
                    || ($s['conversations'][$i]['title'] ?? '') === 'New conversation')) {
                $s['conversations'][$i]['title'] = mb_substr($content, 0, 40)
                    . (mb_strlen($content) > 40 ? '…' : '');
            }
            return true;
        });
        jexit($state);
    }

    case 'rename': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b = read_body();
        $id    = (string)($b['id'] ?? '');
        $title = (string)($b['title'] ?? '');
        if ($id === '' || $title === '') jexit(['error' => 'id and title required'], 400);

        $state = with_state_lock($DATA_FILE, $LOCK_FILE, function (array &$s) use ($id, $title): bool {
            $i = find_conv($s, $id);
            if ($i === null) return false;
            $s['conversations'][$i]['title'] = $title;
            return true;
        });
        jexit($state);
    }

    case 'delete': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b = read_body();
        $id = (string)($b['id'] ?? '');
        if ($id === '') jexit(['error' => 'id required'], 400);

        $state = with_state_lock($DATA_FILE, $LOCK_FILE, function (array &$s) use ($id): bool {
            $i = find_conv($s, $id);
            if ($i === null) return false;
            array_splice($s['conversations'], $i, 1);
            if (($s['activeId'] ?? null) === $id) {
                $s['activeId'] = $s['conversations'][0]['id'] ?? null;
            }
            return true;
        });
        jexit($state);
    }

    case 'setActive': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        $b  = read_body();
        $id = (string)($b['id'] ?? '');
        if ($id === '') jexit(['error' => 'id required'], 400);
        $state = with_state_lock($DATA_FILE, $LOCK_FILE, function (array &$s) use ($id): bool {
            if (find_conv($s, $id) === null) return false;
            if (($s['activeId'] ?? null) === $id) return false;
            $s['activeId'] = $id;
            return true;
        });
        jexit($state);
    }

    case 'debug': {
        require_auth();
        $keySet    = $GROQ_API_KEY !== '';
        $keyPreview = $keySet
            ? substr($GROQ_API_KEY, 0, 8) . '...' . substr($GROQ_API_KEY, -4)
            : '(not set)';
        $envExists = is_file(__DIR__ . '/.env');
        $curlOk    = function_exists('curl_init');
        $furlOk    = (bool) ini_get('allow_url_fopen');
        jexit([
            'env_file_found'   => $envExists,
            'groq_key_set'     => $keySet,
            'groq_key_preview' => $keyPreview,
            'curl_available'   => $curlOk,
            'allow_url_fopen'  => $furlOk,
            'php_version'      => PHP_VERSION,
        ]);
    }

    case 'chat': {
        require_auth();
        if ($method !== 'POST') jexit(['error' => 'method'], 405);
        if ($GROQ_API_KEY === '') jexit(['error' => 'Groq API key not configured on server'], 500);

        $b        = read_body();
        $messages = $b['messages'] ?? null;
        $model    = (string)($b['model'] ?? $GROQ_MODEL);
        $temp     = (float)($b['temperature'] ?? 0.4);
        $maxTok   = (int)($b['max_tokens'] ?? 1024);

        if (!is_array($messages) || count($messages) === 0) {
            jexit(['error' => 'messages array required'], 400);
        }

        $payload = json_encode([
            'model'       => $model,
            'messages'    => $messages,
            'temperature' => $temp,
            'max_tokens'  => $maxTok,
            'stream'      => false,
        ], JSON_UNESCAPED_UNICODE);

        // Use cURL (preferred on shared hosting); fall back to file_get_contents
        if (function_exists('curl_init')) {
            $ch = curl_init($GROQ_ENDPOINT);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_TIMEOUT        => 60,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . $GROQ_API_KEY,
                ],
            ]);
            $raw        = curl_exec($ch);
            $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr    = curl_error($ch);
            curl_close($ch);
            if ($raw === false || $curlErr !== '') {
                jexit(['error' => 'cURL error: ' . $curlErr], 502);
            }
        } else {
            $ctx = stream_context_create([
                'http' => [
                    'method'        => 'POST',
                    'header'        => "Content-Type: application/json\r\nAuthorization: Bearer " . $GROQ_API_KEY,
                    'content'       => $payload,
                    'ignore_errors' => true,
                    'timeout'       => 60,
                ],
            ]);
            $raw        = @file_get_contents($GROQ_ENDPOINT, false, $ctx);
            $httpStatus = 200;
            foreach ($http_response_header ?? [] as $h) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) {
                    $httpStatus = (int)$m[1];
                }
            }
            if ($raw === false) {
                jexit(['error' => 'Failed to reach Groq endpoint (allow_url_fopen may be disabled and cURL is unavailable)'], 502);
            }
        }

        http_response_code($httpStatus);
        echo $raw;
        exit;
    }

    default:
        jexit(['error' => 'unknown action'], 404);
}

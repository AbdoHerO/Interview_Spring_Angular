<?php
// ============================================================================
// Interview Revision Hub — PHP -> Python AI service proxy.
//
// All AI Interview Simulator calls from the browser go through this proxy,
// which:
//   1) reuses the existing PHP session (require_auth) — no new credentials.
//   2) injects the X-Internal-Token header so the Python service trusts us.
//   3) forwards multipart uploads transparently for file/zip ingestion.
//
// Endpoints (all under api/action mapping):
//   GET  ai_proxy.php?action=health
//   POST ai_proxy.php?action=upload                (multipart: file, kind)
//   POST ai_proxy.php?action=analyze-repository    (json:  {url, branch?})
//   POST ai_proxy.php?action=start-interview       (json:  StartInterviewRequest)
//   POST ai_proxy.php?action=answer                (json:  {session_id, answer})
//   GET  ai_proxy.php?action=interview-state&session_id=...
//   POST ai_proxy.php?action=score-interview&session_id=...
// ============================================================================

declare(strict_types=1);

// ---- load .env (shared with api.php) ----
$_ENV_FILE = __DIR__ . '/.env';
if (is_file($_ENV_FILE)) {
    foreach (file($_ENV_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_line) {
        if ($_line === '' || $_line[0] === '#') continue;
        [$_k, $_v] = array_pad(explode('=', $_line, 2), 2, '');
        $_ENV[trim($_k)] = trim($_v);
    }
}

$AI_BASE        = rtrim($_ENV['AI_SERVICE_URL']     ?? 'http://localhost:8088', '/');
$INTERNAL_TOKEN = (string)($_ENV['INTERNAL_SHARED_SECRET'] ?? '');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path'     => '/', 'httponly' => true, 'secure' => false, 'samesite' => 'Lax',
]);
session_name('IRH_SESSION');
session_start();

function jexit(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_auth(): void {
    if (empty($_SESSION['auth'])) {
        jexit(['error' => 'unauthorized'], 401);
    }
}

require_auth();

if ($INTERNAL_TOKEN === '' || $INTERNAL_TOKEN === 'change-me-to-a-long-random-string') {
    jexit(['error' => 'ai-service not configured (set INTERNAL_SHARED_SECRET in .env)'], 503);
}

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];

// Map proxy actions -> upstream paths + expected method.
$routes = [
    'health'              => ['GET',  '/healthz'],
    'upload'              => ['POST', '/api/upload'],
    'analyze-repository'  => ['POST', '/api/analyze-repository'],
    'start-interview'     => ['POST', '/api/start-interview'],
    'answer'              => ['POST', '/api/answer'],
    'interview-state'     => ['GET',  '/api/interview-state'],
    'score-interview'     => ['POST', '/api/score-interview'],
    'voice-ticket'        => ['POST', '/api/voice/ticket'],
    'voice-config'        => ['GET',  null],   // synthetic — answered locally below
];

if (!isset($routes[$action])) {
    jexit(['error' => 'unknown action'], 404);
}

[$expectedMethod, $path] = $routes[$action];
if ($method !== $expectedMethod) {
    jexit(['error' => "method not allowed (expected $expectedMethod)"], 405);
}

// 'voice-config' is answered locally — it tells the browser where to open
// the WebSocket directly. We deliberately do NOT proxy WS through PHP.
if ($action === 'voice-config') {
    // The browser opens this socket itself, so the URL must be one the browser
    // can resolve. Under Docker, AI_SERVICE_URL is http://ai:8088 — a name that
    // exists only inside the compose network — so deriving the WebSocket URL
    // from it hands the browser ws://ai:8088, which fails before it connects.
    // AI_PUBLIC_WS_URL is the public origin (wss://interview.zincolo.com),
    // reverse-proxied to the AI service by Nginx for this one path.
    $publicWs = trim((string)($_ENV['AI_PUBLIC_WS_URL'] ?? ''));
    if ($publicWs !== '') {
        jexit(['ws_url' => rtrim($publicWs, '/') . '/api/voice/ws']);
    }

    // Unset: local development, where AI_SERVICE_URL is already an address the
    // browser can reach. Convert http(s)://host:port to ws(s)://host:port.
    $ws = preg_replace('#^http#i', 'ws', $AI_BASE);
    jexit(['ws_url' => $ws . '/api/voice/ws']);
}

// forward query string (e.g. session_id)
$qs = $_GET;
unset($qs['action']);
$query = http_build_query($qs);
$upstream = $AI_BASE . $path . ($query ? "?$query" : '');

$ch = curl_init($upstream);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 180,
    CURLOPT_CUSTOMREQUEST  => $method,
]);

$headers = ["X-Internal-Token: $INTERNAL_TOKEN", "Accept: application/json"];

if ($method === 'POST') {
    if ($action === 'upload') {
        // multipart passthrough
        if (empty($_FILES['file'])) jexit(['error' => 'no file uploaded'], 400);
        $f = $_FILES['file'];
        if ($f['error'] !== UPLOAD_ERR_OK) jexit(['error' => 'upload error'], 400);
        $post = [
            'file' => new CURLFile($f['tmp_name'], $f['type'] ?: 'application/octet-stream', $f['name']),
            'kind' => $_POST['kind'] ?? 'auto',
        ];
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
        // Content-Type is set by curl with the multipart boundary
    } else {
        $raw = file_get_contents('php://input') ?: '';
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $raw);
    }
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$body   = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($body === false) {
    jexit(['error' => 'ai-service unreachable', 'detail' => $err], 502);
}

http_response_code($status ?: 500);
echo $body;

<?php
/**
 * Deployment health probe for the web tier.
 *
 * Standalone on purpose: no session is started, so a probe every 30 seconds
 * does not litter the session store. It reports no detail — the pipeline reads
 * container logs for that, and this endpoint is reachable through the public
 * domain.
 *
 * It deliberately does NOT check the AI service. The revision hub, its login
 * and its chat sync all work with the AI service down, so coupling this probe
 * to it would fail a deploy that is actually fine.
 */
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

// Copied to the document root by the Dockerfile, so __DIR__ is the app root.
$root = __DIR__;

// The two things that genuinely break the app if wrong: the credentials file
// the entrypoint renders, and a writable data directory for chat.json.
if (!is_file($root . '/.env')) {
    http_response_code(503);
    echo 'env';
    exit;
}

if (!is_dir($root . '/data') || !is_writable($root . '/data')) {
    http_response_code(503);
    echo 'data';
    exit;
}

echo 'ok';

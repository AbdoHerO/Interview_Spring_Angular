# Local dev server with multiple PHP workers so long-polling does not block
# concurrent requests from other devices/browsers.
$env:PHP_CLI_SERVER_WORKERS = 8
Write-Host "Starting PHP dev server on http://0.0.0.0:8000 with $($env:PHP_CLI_SERVER_WORKERS) workers..." -ForegroundColor Cyan
php -S 0.0.0.0:8000

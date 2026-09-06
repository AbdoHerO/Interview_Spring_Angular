#!/bin/sh
# Interview Revision Hub — web container entrypoint.
#
# Writes the .env file that api.php and ai_proxy.php already read, then refuses
# to start if the login credentials are missing. Both PHP files used to fall
# back to hardcoded credentials that are public in this repository's git
# history; failing closed is what makes that fallback unreachable in production.
set -eu

APP_ROOT=/var/www/html
export APP_ROOT
ENV_FILE="$APP_ROOT/.env"

# ---------------------------------------------------------------------------
# 1. Refuse to boot without credentials.
#
# A missing APP_PASSWORD would otherwise mean the app quietly serves on a public
# domain with whatever default the source falls back to. Crashing here is loud,
# and the pipeline's health gate turns it into a failed build.
# ---------------------------------------------------------------------------
if [ -z "${APP_USERNAME:-}" ] || [ -z "${APP_PASSWORD:-}" ]; then
    echo "interview: APP_USERNAME and APP_PASSWORD must both be set." >&2
    echo "interview: set them in the CloudForge deployment environment file." >&2
    exit 1
fi

if [ -z "${INTERNAL_SHARED_SECRET:-}" ]; then
    echo "interview: INTERNAL_SHARED_SECRET is required — it is the only thing" >&2
    echo "interview: stopping anyone from calling the AI service directly." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Render .env.
#
# api.php and ai_proxy.php parse this file themselves with a naive
# `explode('=', $line, 2)`, so values must carry no quotes and no inline
# comments. Written at container start rather than baked into the image, so no
# API key is ever stored in an image layer.
# ---------------------------------------------------------------------------
umask 027
cat > "$ENV_FILE" <<EOF
# Generated at container start from the environment. Do not edit — every
# restart overwrites it. Change the CloudForge environment credential instead.
APP_USERNAME=${APP_USERNAME}
APP_PASSWORD=${APP_PASSWORD}

GROQ_API_KEY=${GROQ_API_KEY:-}
GROQ_ENDPOINT=${GROQ_ENDPOINT:-https://api.groq.com/openai/v1/chat/completions}
GROQ_MODEL=${GROQ_MODEL:-meta-llama/llama-4-scout-17b-16e-instruct}

AI_SERVICE_URL=${AI_SERVICE_URL:-http://ai:8088}
INTERNAL_SHARED_SECRET=${INTERNAL_SHARED_SECRET}
AI_PUBLIC_WS_URL=${AI_PUBLIC_WS_URL:-}
EOF

# Readable by Apache, writable by nobody. Apache also denies it by name, but a
# file mode is the lock that does not depend on a config file staying correct.
chown root:www-data "$ENV_FILE"
chmod 640 "$ENV_FILE"

# ---------------------------------------------------------------------------
# 3. The volume owns these paths, not the image, so re-assert on every start.
#
# data/ is where api.php writes chat.json and its lock file. Without the write
# bit the chat silently stops syncing rather than erroring visibly.
# ---------------------------------------------------------------------------
mkdir -p "$APP_ROOT/data"
chown -R www-data:www-data "$APP_ROOT/data" /var/lib/php/sessions
chmod 750 "$APP_ROOT/data"

echo "interview: web tier ready (ai upstream ${AI_SERVICE_URL:-http://ai:8088})"

exec "$@"

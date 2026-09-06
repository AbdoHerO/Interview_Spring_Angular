// Interview Revision Hub — deployment pipeline, run by Jenkins on the VPS.
//
// Contract with CloudForge (see docs/JENKINS-PIPELINES.md in CloudForge):
//
//   HOST_PORT                    the loopback port the managed Nginx site
//                                proxies to. CloudForge owns it: read-only in
//                                the run form and reasserted on every status
//                                read. Change it via the pipeline's
//                                "Application port", never in Jenkins.
//   CLOUDFORGE_ENV_CREDENTIAL_ID id of the folder-scoped Jenkins secret-text
//                                credential holding the base64 environment
//                                file. Refreshed from CloudForge every build.
//
// AI_HOST_PORT is ours, not CloudForge's: CloudForge owns exactly one
// application port per pipeline, and this stack publishes a second one for the
// voice WebSocket route. It is declared here so the value the Nginx route
// points at is written down in the repository rather than only in a form.

pipeline {
    agent any

    // No timestamps(): that needs the Timestamper plugin, which is not among
    // the plugins CloudForge requires, and a missing plugin fails the job
    // before any stage runs.
    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        // The AI image compiles pymupdf, tiktoken and lxml wheels; the first
        // build on a fresh VPS is genuinely slow.
        timeout(time: 45, unit: 'MINUTES')
    }

    parameters {
        string(
            name: 'HOST_PORT',
            defaultValue: '8091',
            description: 'Web tier loopback port. Managed by CloudForge — set it there.'
        )
        string(
            name: 'AI_HOST_PORT',
            defaultValue: '8092',
            description: 'AI service loopback port. The Nginx /api/voice/ws route must point here.'
        )
        string(
            name: 'CLOUDFORGE_ENV_CREDENTIAL_ID',
            defaultValue: params.CLOUDFORGE_ENV_CREDENTIAL_ID ?: '',
            description: 'Managed by CloudForge.'
        )
    }

    environment {
        COMPOSE_PROJECT_NAME = 'interview-hub'
        IMAGE_TAG = "b${BUILD_NUMBER}"

        // Every params.* reference below needs its own default, because on the
        // very first build Jenkins has not yet evaluated the parameters block
        // above — it queues the job with only the parameters CloudForge itself
        // supplies. AI_HOST_PORT is not one of those (CloudForge owns exactly
        // one application port), so on run #1 it is simply absent, and `set -u`
        // in the Deploy stage turned that into a hard failure.
        //
        // Resolving the ports here means every later stage reads one already
        // defaulted value instead of repeating the fallback.
        WEB_PORT = "${params.HOST_PORT ?: '8091'}"
        AI_PORT = "${params.AI_HOST_PORT ?: '8092'}"
        HEALTH_URL = "http://127.0.0.1:${params.HOST_PORT ?: '8091'}/health.php"
        AI_HEALTH_URL = "http://127.0.0.1:${params.AI_HOST_PORT ?: '8092'}/healthz"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                sh 'git --no-pager log -1 --pretty="%h %an %s"'
            }
        }

        stage('Preflight') {
            steps {
                sh '''
                    set -eu
                    docker version >/dev/null
                    docker compose version >/dev/null
                '''
                script {
                    if (!params.CLOUDFORGE_ENV_CREDENTIAL_ID?.trim()) {
                        error('''No environment credential.

Attach an encrypted deployment environment file to this pipeline in CloudForge
(Jenkins Pipelines -> edit -> "Encrypted deployment environment file"), save it,
and run the pipeline from CloudForge once. That managed run installs the secret
into this Jenkins folder and supplies its id; later runs reuse it.''')
                    }
                }
            }
        }

        stage('Environment') {
            steps {
                withCredentials([string(
                    credentialsId: params.CLOUDFORGE_ENV_CREDENTIAL_ID,
                    variable: 'CF_ENV_B64'
                )]) {
                    sh '''
                        set -eu
                        # Written before the file exists, so it is never briefly
                        # world-readable on a shared build host.
                        umask 077
                        printf '%s' "$CF_ENV_B64" | base64 -d > .env

                        # Fail here with a clear message rather than inside a
                        # compose variable-substitution error.
                        for key in APP_USERNAME APP_PASSWORD INTERNAL_SHARED_SECRET AI_PUBLIC_WS_URL; do
                            grep -qE "^${key}=." .env || {
                                echo "Environment file is missing ${key}." >&2
                                exit 1
                            }
                        done

                        # Without a provider key the interview and voice tabs
                        # deploy successfully and then fail at first use, which
                        # is a worse outcome than failing here.
                        if ! grep -qE "^(OPENAI_API_KEY|GROQ_API_KEY)=." .env; then
                            echo "No OPENAI_API_KEY or GROQ_API_KEY — the AI service would have no provider." >&2
                            exit 1
                        fi

                        echo "Environment file loaded ($(grep -c '=' .env) values)."
                    '''
                }
            }
        }

        stage('Build images') {
            steps {
                sh '''
                    set -eu
                    # --pull picks up base-image security updates; without it a
                    # long-lived host keeps deploying a stale php/python layer.
                    docker compose build --pull
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -eu
                    # Compose reads these from the process environment, and a
                    # shell variable beats the .env file in its precedence order
                    # — which is what keeps the CloudForge-owned port the single
                    # source of truth for what Nginx proxies to.
                    #
                    # Sourced from WEB_PORT/AI_PORT rather than the raw
                    # parameters: those are already defaulted in the environment
                    # block, so this stage cannot trip over an unset parameter
                    # on a first build.
                    export HOST_PORT="$WEB_PORT"
                    export AI_HOST_PORT="$AI_PORT"
                    echo "web -> 127.0.0.1:${WEB_PORT}   ai -> 127.0.0.1:${AI_PORT}"
                    docker compose up -d --remove-orphans
                    docker compose ps
                '''
            }
        }

        stage('Health gate') {
            steps {
                sh '''
                    set -eu

                    if command -v curl >/dev/null 2>&1; then
                        fetch() { curl -fsS --max-time 5 "$1" 2>/dev/null; }
                    elif command -v wget >/dev/null 2>&1; then
                        fetch() { wget -qO- --timeout=5 "$1" 2>/dev/null; }
                    else
                        echo "Neither curl nor wget is installed on this VPS." >&2
                        exit 1
                    fi

                    # Probes the published loopback ports, which are the exact
                    # addresses Nginx proxies to — so passing here means the
                    # domain will work, not merely that a container is running.
                    echo "Probing $HEALTH_URL"
                    i=0
                    until fetch "$HEALTH_URL" | grep -qx 'ok'; do
                        i=$((i + 1))
                        [ "$i" -ge 40 ] && { echo "Web tier unhealthy after 2 minutes." >&2; exit 1; }
                        sleep 3
                    done
                    echo "Web healthy after $((i * 3))s."

                    # The AI service loads tiktoken and the embedding client on
                    # first boot, so it is legitimately slower than the web tier.
                    echo "Probing $AI_HEALTH_URL"
                    i=0
                    until fetch "$AI_HEALTH_URL" | grep -q '"status"'; do
                        i=$((i + 1))
                        [ "$i" -ge 60 ] && { echo "AI service unhealthy after 3 minutes." >&2; exit 1; }
                        sleep 3
                    done
                    echo "AI healthy after $((i * 3))s."

                    # health.php proves PHP runs and the volume is writable. It
                    # cannot prove Apache will actually serve the content, and a
                    # too-broad deny rule once made every Concepts and Q&A page
                    # return 403 while this gate stayed green. So fetch a real
                    # content file, chosen from the checkout rather than
                    # hardcoded, and require a 200.
                    md=$(find files -name '*.md' | head -1)
                    if [ -n "$md" ]; then
                        # Spaces are the only character in these exported
                        # filenames that curl will not send as-is.
                        enc=$(printf '%s' "$md" | sed 's/ /%20/g')
                        code=$(curl -o /dev/null -s -w '%{http_code}' \
                            "http://127.0.0.1:${WEB_PORT}/${enc}" || echo 000)
                        if [ "$code" != "200" ]; then
                            echo "Content check failed: /${enc} returned ${code}, expected 200." >&2
                            exit 1
                        fi
                        echo "Content check ok: /${enc}"
                    fi
                '''
            }
        }

        stage('Cleanup') {
            steps {
                // Dangling layers only — never a filtered prune that could
                // remove an image another stack on this VPS still uses.
                sh 'docker image prune -f'
            }
        }
    }

    post {
        failure {
            sh '''
                echo "===== compose ps ====="
                docker compose ps || true
                echo "===== web logs ====="
                docker compose logs --tail=120 web || true
                echo "===== ai logs ====="
                docker compose logs --tail=120 ai || true
                echo "===== qdrant logs ====="
                docker compose logs --tail=40 qdrant || true
            '''
        }
        always {
            // The decoded environment must not survive the build, even when a
            // stage failed before compose ever read it.
            sh 'rm -f .env'
        }
        success {
            echo "Deployed interview-hub ${IMAGE_TAG}: web 127.0.0.1:${WEB_PORT}, ai 127.0.0.1:${AI_PORT}"
        }
    }
}

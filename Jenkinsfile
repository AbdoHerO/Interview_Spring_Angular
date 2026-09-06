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
        HEALTH_URL = "http://127.0.0.1:${params.HOST_PORT}/health.php"
        AI_HEALTH_URL = "http://127.0.0.1:${params.AI_HOST_PORT}/healthz"
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
                    # HOST_PORT, AI_HOST_PORT and IMAGE_TAG reach Compose through
                    # the process environment (Jenkins exports build parameters),
                    # and a shell variable beats the .env file in Compose's
                    # precedence order.
                    echo "web -> 127.0.0.1:${HOST_PORT}   ai -> 127.0.0.1:${AI_HOST_PORT}"
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
            echo "Deployed interview-hub ${IMAGE_TAG}: web 127.0.0.1:${params.HOST_PORT}, ai 127.0.0.1:${params.AI_HOST_PORT}"
        }
    }
}

# Deploying the Interview Revision Hub to interview.zincolo.com

| Setting | Value |
| --- | --- |
| Domain | `interview.zincolo.com` (subdomain of the existing `zincolo.com` zone) |
| Web port (VPS loopback) | `8091` |
| AI service port (VPS loopback) | `8092` |
| Repository | `https://github.com/AbdoHerO/Interview_Spring_Angular.git` (public) |
| Branch | `main` |
| Jenkinsfile path | `Jenkinsfile` |
| Compose project | `interview-hub` |

## The stack

```
Internet → Cloudflare (proxied)
         → Nginx  (CloudForge-managed site for interview.zincolo.com)
           ├── /                → 127.0.0.1:8091   web   (Apache/PHP)
           └── /api/voice/ws    → 127.0.0.1:8092   ai    (FastAPI, WebSocket)
                                                   qdrant (no port at all)
```

Three containers. `web` serves the site and proxies every AI call server-side
through `ai_proxy.php`, so the AI service needs no public exposure — **except**
`/api/voice/ws`, which the browser opens directly. That single path is
ticket-gated: `ai_proxy.php` mints a short-lived HMAC ticket over the
authenticated PHP session, and the WebSocket rejects anything else.

Qdrant publishes no port. It has no authentication configured, so exposing it
even on loopback would put the whole knowledge base one `curl` away for anything
running on the VPS.

---

## 0. Rotate the exposed password — do this first

`README.md` and `js/config.js` published a working password to a public
repository. Both are cleaned up in this commit, but **git history keeps it**, so
the string itself is burned. It must not be reused anywhere.

The generated environment file already contains a new one. If you used that
password for anything else — the CloudForge workspace passkey especially —
change it there too.

## 1. Prerequisites on the VPS

Already satisfied if you deployed `lp-tifaw` on this server. Otherwise, in
**Ansible**: Docker Engine (with `jenkins` in the Docker users field), Jenkins,
Nginx.

**Check free memory before the first build.** Qdrant wants roughly 1 GB and the
Python service another 500 MB or so on top of what is already running. In
**SSH Terminal**: `free -h`.

## 2. Store the environment file

**Secrets → Add credential → Deployment Environment File**

- **Name:** `interview-hub env production`
- **Filename:** `.env.production`
- **Content:** the file picker → `C:\Users\abder\Documents\interview-hub.env.production`

It already carries your OpenAI and Groq keys (read from your local `.env`
files), a fresh app password and a fresh 64-character internal token.
`.env.example` documents every key.

## 3. Create the pipeline

**Jenkins Pipelines → New pipeline**

| Field | Value |
| --- | --- |
| VPS target | `abdohero · 84.8.217.33` |
| Jenkins credential | `HanoutPlus Jenkins` |
| Name | `interview-hub` |
| Definition | **Jenkinsfile from Git** |
| Repository access | **Public repository** |
| Repository URL | `https://github.com/AbdoHerO/Interview_Spring_Angular.git` |
| Branch / ref | `main` |
| Jenkinsfile path | `Jenkinsfile` |
| Encrypted deployment environment file | `interview-hub env production` |
| Configure application domain | **on** |
| Application domain | `interview.zincolo.com` |
| Application port on VPS | `8091` |
| Cloudflare credential | `cloudforge-hanoutplus-production` |
| Cloudflare Zone ID | leave blank — resolved from the domain |

**Additional application routes** — add one:

| Path | Port |
| --- | --- |
| `/api/voice/ws` | `8092` |

That is the route CloudForge describes as "a separate WebSocket port". Without
it the voice tab connects to the web container, which knows nothing about
WebSockets, and fails with a 400.

**Save to Jenkins.**

> If saving fails on DNS: an `A` record for `interview.zincolo.com` that
> CloudForge did not create and that points elsewhere is refused rather than
> repointed. Delete it in **Cloudflare → DNS**, then save again — CloudForge
> then creates and owns the record. A record already pointing at the VPS is left
> alone and saving proceeds.

## 4. First run

**Run pipeline.** Expect 10–20 minutes: the AI image compiles `pymupdf`,
`tiktoken` and `lxml` wheels. Later builds reuse the layer cache.

Then click **Status / sync parameters** once, so the run form learns
`HOST_PORT`, `AI_HOST_PORT` and `CLOUDFORGE_ENV_CREDENTIAL_ID`.

The build fails rather than half-deploying if either tier is unhealthy, and
prints all three containers' logs when it does.

## 5. Nginx — two settings that matter

**Nginx → Sites → `interview.zincolo.com` → edit:**

1. **Body size: `56M`.** Interview uploads go up to `MAX_UPLOAD_MB` (50). The
   1 MB default rejects them before PHP ever sees the request.
2. **WebSocket headers: on** for the `/api/voice/ws` route, and raise that
   route's **read timeout** to `3600s`. Nginx's 60-second default closes an idle
   voice socket mid-interview, which surfaces as the assistant going silent for
   no visible reason.

The chat long-poll is capped at 30 seconds in `api.php`, so it fits inside the
default timeout — the `/` route needs no change.

## 6. Certificate

**SSL & Domains → Cloudflare Origin CA →** select the Cloudflare credential →
**Verify DNS** → **Issue certificate**.

Until this runs, Nginx has no `listen 443` block for this hostname, so with the
zone on SSL mode Full, Cloudflare's HTTPS request falls through to whichever
443 server block is the default on this VPS — you will see a different site.
That is expected between steps 4 and 6, not a broken deploy.

Also enable **Always Use HTTPS** for the zone. `session.cookie_secure` is on, so
a browser will not send the session cookie over plain HTTP and login would
appear to silently fail.

## 7. Verify

1. `https://interview.zincolo.com` loads the hub.
2. Log in with `abdohero` and the password from the environment file.
3. Open it in a second browser and send a chat message — it should appear in the
   first within about a second (that is the long-poll working through Nginx).
4. Start an AI interview — exercises `ai_proxy.php` → `ai` → OpenAI → Qdrant.
5. Start a voice session — exercises the `/api/voice/ws` route and the ticket.

If voice fails, check in this order: browser console for the `wss://` URL it
tried, then `AI_PUBLIC_WS_URL` in the credential, then the Nginx route.

---

## Operating it

```sh
docker compose -p interview-hub ps
docker compose -p interview-hub logs -f web
docker compose -p interview-hub logs -f ai
```

Back up before anything destructive — chat history and the vector store are
only in volumes:

```sh
docker run --rm -v interview-hub_chatdata:/src -v "$PWD":/out alpine \
  tar czf /out/interview-chat-$(date +%F).tar.gz -C /src .
docker run --rm -v interview-hub_qdrantdata:/src -v "$PWD":/out alpine \
  tar czf /out/interview-qdrant-$(date +%F).tar.gz -C /src .
```

**Changing a secret:** edit the credential in **Secrets**, then run the
pipeline. Never edit values in the Jenkins UI — CloudForge reasserts what it
owns on every read.

## What changed in the application source

Four edits, all required to deploy this safely rather than to make it work:

- **`api.php`** — removed the hardcoded credential fallback. A missing `.env`
  now returns 503 instead of silently accepting the password that is public in
  git history.
- **`js/config.js`** — emptied `auth`. That file is served to the browser, so
  its contents were readable with view-source by anyone.
- **`js/auth.js`** — the offline fallback now requires both values to be
  non-empty, so two empty strings cannot match the emptied config and log in.
- **`ai_proxy.php`** — `voice-config` returns `AI_PUBLIC_WS_URL` when set.
  Deriving the WebSocket URL from `AI_SERVICE_URL` handed the browser
  `ws://ai:8088`, a name that only resolves inside the compose network. With the
  variable unset the old behaviour is unchanged, so local development still
  works exactly as before.

`.gitignore` also now matches `ai-service/.env` explicitly. It was untracked by
luck rather than by rule, and it holds the OpenAI key.

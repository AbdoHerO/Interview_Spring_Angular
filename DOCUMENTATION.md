# Interview Revision Hub — Complete Project Documentation

> Generated May 2026. Use this file to onboard a new AI assistant with full context about the project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [How the App Works (User Flow)](#3-how-the-app-works-user-flow)
4. [Authentication](#4-authentication)
5. [PHP Backend — api.php](#5-php-backend--apiphp)
6. [Real-Time Multi-Device Chat Sync](#6-real-time-multi-device-chat-sync)
7. [Frontend Modules](#7-frontend-modules)
8. [Markdown Rendering](#8-markdown-rendering)
9. [Search System](#9-search-system)
10. [AI Chat (Groq)](#10-ai-chat-groq)
11. [Styles & UI](#11-styles--ui)
12. [Known Issues & Fixes Applied](#12-known-issues--fixes-applied)
13. [Deployment](#13-deployment)
14. [Credentials & Keys](#14-credentials--keys)
15. [Pending Work & Future Ideas](#15-pending-work--future-ideas)

---

## 1. Project Overview

**Interview Revision Hub** is a single-page web application for studying Java, Spring Boot, and Angular interview material. It renders Notion-exported markdown files, provides smart keyword search, and includes an AI chat assistant powered by Groq.

**Key requirements:**
- Pure HTML + CSS + JS frontend (no build step, no npm, no framework)
- PHP backend only for chat persistence and multi-device sync
- Chat messages stored in a JSON file — no database
- Real-time sync between devices without page refresh (long-polling)
- Login with username + password (single user)
- Works on Hostinger shared hosting (Apache/LiteSpeed + PHP 8)

---

## 2. File Structure

```
revesion_Java_Spring_Angular/
│
├── index.html                  # Single HTML file — entire app shell
├── styles.css                  # All CSS (dark theme, responsive)
├── api.php                     # PHP REST API for auth + chat sync
├── serve.ps1                   # Helper: start PHP dev server with 8 workers
├── README.md                   # Quick-start instructions
├── DOCUMENTATION.md            # ← this file
│
├── data/                       # Auto-created by api.php on first request
│   ├── chat.json               # All conversations stored here
│   ├── chat.lock               # flock() mutex file
│   └── .htaccess               # Deny direct HTTP access to this folder
│
├── js/
│   ├── config.js               # APP_CONFIG: credentials, sections list, Groq settings
│   ├── auth.js                 # Auth module: server session + localStorage fallback
│   ├── markdown.js             # Markdown loader/renderer: image paths, TOC links
│   ├── search.js               # Search index builder + scoring engine
│   ├── chat.js                 # ChatStore: long-poll sync, Groq client, mutations
│   └── app.js                  # App glue: routing, nav, search UI, chat UI
│
└── files/                      # Notion-exported content
    ├── Business Manager (IT) .md
    ├── Java 8 17 Interview .md
    ├── Questions utils (Java) .md
    ├── Question Utils in Spring boot (Microservice Spring .md
    ├── Angular_Interview_-_47_questions.pdf
    └── Spring Boot Interview/
        └── Spring Boot Interview.md
```

---

## 3. How the App Works (User Flow)

1. Browser loads `index.html` — login screen shown, app div is `hidden`.
2. User submits credentials → `auth.js` POSTs to `api.php?action=login`.
3. On success: PHP sets a session cookie; JS sets `localStorage.irh_auth_v1 = 'ok'`.
4. App div shown, `initApp()` runs:
   - Sidebar nav is built from `APP_CONFIG.sections`.
   - `ChatStore.init()` loads state from server (or localStorage fallback).
   - Long-poll loop starts in background.
   - Search index is built by fetching and parsing all markdown files.
5. User clicks a section → markdown is fetched, rendered, injected into `#content`.
6. Sommaire/TOC links inside the markdown scroll to in-page sections (not Notion).
7. User opens AI chat → types a message → `ChatStore.send()` is called:
   - User message saved to server immediately.
   - Groq API called with full conversation history + system prompt.
   - Assistant reply saved to server.
   - All subscribed devices see both messages via long-poll within ~1 second.

---

## 4. Authentication

### Files involved
- `js/config.js` — stores credentials (single user)
- `js/auth.js` — Auth module
- `api.php` — session management

### How it works

**Login** (`Auth.login(user, pass)`):
1. POSTs `{ user, pass }` to `api.php?action=login`.
2. PHP compares against hardcoded `$USERNAME` / `$PASSWORD`.
3. On success: PHP sets `$_SESSION['auth'] = true` → sends `Set-Cookie: PHPSESSID=...`.
4. JS stores `localStorage.irh_auth_v1 = 'ok'` as a fallback flag.
5. If server unreachable: JS compares against `APP_CONFIG.auth` (client-side fallback).

**Session check** (`Auth.isAuthenticated()`):
- Fetches `api.php?action=state` with `credentials: 'include'`.
- Returns `true` if HTTP 200, `false` if HTTP 401.
- Falls back to `localStorage.irh_auth_v1 === 'ok'` if network fails.

**Logout** (`Auth.logout()`):
- POSTs to `api.php?action=logout` → PHP destroys session + clears cookie.
- Removes `localStorage.irh_auth_v1`.

### Session persistence issue (known)
With `php -S` dev server, PHP sessions may not persist between requests reliably if session files are not writable or if the session cookie domain/path doesn't match. On Apache (XAMPP / Hostinger) this works fine. The `localStorage` fallback ensures the user isn't logged out in single-device mode.

**Fix**: PHP session cookie is configured with `lifetime = 30 days`, `httponly`, `SameSite=Lax`. The cookie must be accepted by the browser.

---

## 5. PHP Backend — api.php

### Location
`api.php` at the project root. No framework, plain PHP 8.

### Data storage
- `data/chat.json` — JSON file with all conversations.
- `data/chat.lock` — used with `flock()` for mutual exclusion.
- `data/.htaccess` — `Require all denied` prevents direct browser access.

### JSON structure of chat.json
```json
{
  "version": 42,
  "activeId": "c_abc123",
  "conversations": [
    {
      "id": "c_abc123",
      "title": "Spring Boot question",
      "createdAt": 1715300000000,
      "messages": [
        { "role": "user",      "content": "What is autoconfiguration?", "ts": 1715300001000 },
        { "role": "assistant", "content": "Autoconfiguration is...",     "ts": 1715300002000 }
      ]
    }
  ]
}
```

### Endpoints

| Method | URL                                | Body / Query          | Description |
|--------|------------------------------------|-----------------------|-------------|
| POST   | `api.php?action=login`             | `{ user, pass }`      | Creates PHP session |
| POST   | `api.php?action=logout`            | —                     | Destroys session |
| GET    | `api.php?action=state`             | —                     | Returns full state JSON |
| GET    | `api.php?action=poll&since=N&timeout=25` | —              | Long-poll: returns when `version > N` |
| POST   | `api.php?action=new`               | `{ id, title }`       | Creates new conversation |
| POST   | `api.php?action=append`            | `{ id, message }`     | Appends message to conversation |
| POST   | `api.php?action=rename`            | `{ id, title }`       | Renames conversation |
| POST   | `api.php?action=delete`            | `{ id }`              | Deletes conversation |
| POST   | `api.php?action=setActive`         | `{ id }`              | Sets active conversation |

### Atomic write pattern
```php
function with_state_lock($file, $lock, $mutator) {
    $fp = fopen($lock, 'c');
    flock($fp, LOCK_EX);          // exclusive lock
    $state = load_state($file);   // read current state
    $changed = $mutator($state);  // mutate
    if ($changed) {
        $state['version']++;      // increment version on every change
        $tmp = $file . '.tmp';
        file_put_contents($tmp, json_encode($state));
        rename($tmp, $file);      // atomic replace
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $state;
}
```

### Long-poll endpoint
```php
case 'poll': {
    session_write_close();  // release PHP session lock so other requests can proceed
    $deadline = microtime(true) + $timeout;
    do {
        $state = load_state($DATA_FILE);
        if ($state['version'] > $since) jexit($state);  // new data → return immediately
        usleep(500_000);  // sleep 500ms, then check again
    } while (microtime(true) < $deadline);
    jexit(['version' => $state['version'], 'noChange' => true]);
}
```

---

## 6. Real-Time Multi-Device Chat Sync

### Architecture
```
Device A                    api.php (PHP)                   Device B
   │                            │                               │
   ├─ POST append (user msg) ──►│ write chat.json, version++   │
   │                            │◄── GET poll?since=41 ────────┤
   │                            │   (waiting, sleeping 500ms)  │
   │                            │  version now 42 > 41         │
   │                            ├── return full state ─────────►│
   │                            │                              render new message
   ├─ POST Groq API ──────────► Groq (external)               │
   ├─ POST append (assistant)──►│ write chat.json, version++   │
   │                            │◄── GET poll?since=42 ────────┤
   │                            ├── return full state ─────────►│
```

### Why `PHP_CLI_SERVER_WORKERS=8` is needed locally
`php -S` is single-threaded by default. When Device A holds a 25-second long-poll connection open, Device B's login/state/append requests are **queued** and time out. Setting `PHP_CLI_SERVER_WORKERS=8` spawns 8 worker processes, allowing concurrent requests.

```powershell
# Local dev — ALWAYS use this, not plain php -S
$env:PHP_CLI_SERVER_WORKERS = 8
php -S 0.0.0.0:8000
# OR:
.\serve.ps1
```

On XAMPP / Apache / Hostinger this is not needed — Apache handles concurrency natively.

### Long-poll flow in JS (chat.js)
```js
async _startPolling() {
    const ctrl = new AbortController();
    this._pollAbort = ctrl;
    while (!ctrl.signal.aborted) {
        try {
            const r = await api('poll', null, {
                query: 'since=' + this.version + '&timeout=25',
                signal: ctrl.signal,
            });
            if (r.data?.noChange) {
                if (r.data.version) this.version = r.data.version;
            } else {
                this._applyServerState(r.data);  // updates conversations + emits onChange
            }
        } catch {
            await new Promise(res => setTimeout(res, 2000));  // backoff on error
        }
    }
}
```

### `onChange` subscription in app.js
```js
window.ChatStore.onChange(onStoreChange);  // subscribe before init()
await window.ChatStore.init();             // loads state, starts polling

function onStoreChange() {
    if (!chatHistoryPanel.hidden) renderChatHistoryList();
    if (chatWindow.hidden) return;
    const conv = window.ChatStore.active();
    if (conv.id !== renderedConvId) { renderChatMessages(); return; }
    // Incremental append — only new messages added, no full re-render
    for (let i = renderedCount; i < conv.messages.length; i++) {
        addMessageToDOM(conv.messages[i].role, conv.messages[i].content, false);
    }
    renderedCount = conv.messages.length;
}
```

---

## 7. Frontend Modules

All modules are plain IIFEs (Immediately Invoked Function Expressions) that expose a single global on `window`. Load order in `index.html`:

```html
<script src="js/config.js?v=7"></script>    <!-- must be first: APP_CONFIG -->
<script src="js/auth.js?v=7"></script>
<script src="js/markdown.js?v=7"></script>
<script src="js/search.js?v=7"></script>
<script src="js/chat.js?v=7"></script>
<script src="js/app.js?v=7"></script>       <!-- must be last: uses all above -->
```

### config.js → `window.APP_CONFIG`
```js
window.APP_CONFIG = {
  auth: { username: 'abdohero', password: 'ABDOwahna135795' },
  sections: {
    concepts: [ { id, title, type:'md'|'pdf', path, basePath, description }, ... ],
    qa:       [ ... ],
  },
  groq: {
    apiKey: 'gsk_...',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    promptVersion: 2,
    defaultSystemPrompt: '...',
  }
};
```

### auth.js → `window.Auth`
| Method | Returns | Description |
|--------|---------|-------------|
| `Auth.isAuthenticated()` | `Promise<bool>` | Probes server; falls back to localStorage |
| `Auth.login(user, pass)` | `Promise<bool>` | Server session + localStorage flag |
| `Auth.logout()` | `Promise<void>` | Destroy server session + clear flag |

### markdown.js → `window.MD`
| Method | Description |
|--------|-------------|
| `MD.loadMarkdown(path)` | Fetches markdown, caches result |
| `MD.renderMarkdown(text, basePath)` | Renders to HTML, fixes image paths, rewrites Notion TOC links |
| `MD.slugify(s)` | Converts heading text to URL-safe slug |

### search.js → `window.SearchIndex`
| Method | Description |
|--------|-------------|
| `SearchIndex.build()` | Fetches all md files, splits into heading-blocks, tokenizes |
| `SearchIndex.score(query)` | Returns ranked array of result blocks |
| `SearchIndex.snippet(block, query)` | Returns highlighted text snippet |

### chat.js → `window.ChatStore`
| Property/Method | Description |
|----------------|-------------|
| `ChatStore.conversations` | Array of conversation objects |
| `ChatStore.activeId` | ID of current conversation |
| `ChatStore.serverMode` | `true` if PHP backend is reachable |
| `ChatStore.init()` | Loads state from server or localStorage; starts polling |
| `ChatStore.onChange(fn)` | Subscribe to updates; returns unsubscribe function |
| `ChatStore.active()` | Returns current conversation object |
| `ChatStore.newConversation()` | Creates + selects new conversation |
| `ChatStore.select(id)` | Switch active conversation |
| `ChatStore.delete(id)` | Delete conversation |
| `ChatStore.send(userText)` | Append user msg → call Groq → append assistant reply |
| `ChatStore.getSystemPrompt()` | Get current system prompt from localStorage |
| `ChatStore.setSystemPrompt(p)` | Save custom system prompt |
| `ChatStore.resetSystemPrompt()` | Restore default prompt |

---

## 8. Markdown Rendering

### Libraries (CDN, no npm)
```html
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked-highlight@2.1.1/lib/index.umd.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css" />
```

### marked v12 API changes (important)
- `marked.setOptions()` was **removed** in v12. Use `marked.use({ gfm: true })`.
- `markedHighlight` UMD export is the function itself: `window.markedHighlight` (not `.markedHighlight`).
- Code wraps the setup in try/catch so a CDN failure doesn't break the whole app.

### Image path rewriting
Notion exports images as relative paths. `renderMarkdown(text, basePath)` prepends the section's `basePath`:
```js
html = html.replace(/\b(src|href)="(?!https?:|data:|#|\/)([^"]+)"/g,
  (_, attr, url) => `${attr}="${basePath}${url}"`
);
```

### Sommaire / TOC link rewriting
Notion exports table-of-contents as links with Notion UUIDs (e.g. `href="https://notion.so/abc123"`). These are rewritten to in-page anchor links:
1. After rendering, scan all headings → build a `Map<slug, elementId>`.
2. For each `<a>` whose href is a Notion URL and whose text matches a heading slug → rewrite href to `#slug`.
3. For `<li>` items that are plain text matching a heading → wrap in an `<a href="#slug">`.
4. In `app.js`, a click handler intercepts `a[href^="#"]` links and calls `element.scrollIntoView({ behavior: 'smooth' })`.

---

## 9. Search System

### Index structure
Each markdown file is split into "blocks" at H1/H2/H3 boundaries. Each block has:
- `heading` — the heading text
- `bodyTerms` — tokenized body text
- `headingTerms` — tokenized heading
- `anchor` — slug for in-page linking
- `sectionId`, `sectionTitle`, `group`

### Scoring weights
| Field | Weight |
|-------|--------|
| Exact phrase match in heading | +50 |
| Exact phrase match in body | +15 |
| Each term hit in heading | +14 |
| Each term hit in section title | +3 |
| Each term hit in body | +0.6 |
| All unique query terms matched | +25 bonus |
| Term in body only (partial) | ×0.45 penalty if no heading hit |

### Tokenizer
- Lowercased, NFD-normalized, accents stripped.
- Splits on whitespace and non-word chars.
- Removes 100+ English stopwords.
- Minimum word length: 2 characters.

### UI
- Keyboard: `/` focuses the search input; `↑`/`↓` navigate results; `Enter` opens.
- Results are grouped by section.
- Snippets show surrounding context with matched terms highlighted in `<mark>`.

---

## 10. AI Chat (Groq)

### Model
`meta-llama/llama-4-scout-17b-16e-instruct` via Groq API.

### System prompt (default, v2)
```
You are a concise technical interview coach.
LANGUAGE RULE (highest priority): Always reply in the SAME language as the user's most recent message.
  - If the user writes in French → answer in French.
  - If the user writes in English → answer in English.
  - If the user explicitly asks "in <language>", switch immediately and stay in that language.
STYLE: Direct Q&A. Give the answer first. Add at most 1–3 short bullet points only when truly necessary.
Use code blocks for code. No fluff, no disclaimers, no long introductions.
```

### promptVersion auto-upgrade
When `APP_CONFIG.groq.promptVersion` is bumped, `maybeUpgradePrompt()` in `chat.js` compares the saved version in localStorage and replaces the old default prompt if the user hadn't customised it.

### send() flow
```js
async send(userText) {
    await this._appendMessage(conv.id, 'user', userText);  // persists immediately
    const messages = [
        { role: 'system', content: systemPrompt },
        ...this.active().messages.map(({ role, content }) => ({ role, content }))
    ];
    const res = await fetch(groqEndpoint, { method: 'POST', headers: {...}, body: ... });
    const reply = res.choices[0].message.content;
    await this._appendMessage(conv.id, 'assistant', reply);
    return reply;
}
```

### Conversation history
Full conversation history is sent to Groq on every message (within `max_tokens: 1024`). The system prompt is always first.

### API key security note
The Groq API key is embedded in `js/config.js` (client-side, visible in source). This is an accepted tradeoff for the "no build step" constraint. If you want to hide it, move the Groq fetch to `api.php` and proxy it server-side.

---

## 11. Styles & UI

### Theme
Dark navy theme. Fonts: Inter (UI) + JetBrains Mono (code).

### Key CSS classes
| Class | Purpose |
|-------|---------|
| `.login-screen` | Full-page centered login card |
| `.app` | Main layout: sidebar + content |
| `.sidebar` | Left nav: logo, sections list, sign out |
| `.content` | Right: quick-grid or rendered markdown |
| `.chat-window` | Floating chat panel |
| `.msg.user` / `.msg.assistant` | Chat bubbles |
| `.search-results` | Dropdown result list |
| `.toc-item > a` | TOC link styling inside markdown |

### Chat window size
```css
.chat-window {
  width: min(1020px, 96vw);
  height: min(820px, 88vh);
  background: #2e3650;
}
.chat-header { background: #3a4368; }
.msg.assistant { background: #444f73; }
```

### Important CSS rule
```css
[hidden] { display: none !important; }
```
This overrides rules like `.login-screen { display: grid }` that would otherwise ignore the HTML `hidden` attribute.

---

## 12. Known Issues & Fixes Applied

### Login button did nothing (fixed)
**Cause 1:** `marked.setOptions()` removed in marked v12 — broke `markdown.js` silently, which caused a JS error that prevented the login handler from running.  
**Fix:** Wrapped marked setup in try/catch; switched to `marked.use()`.

**Cause 2:** `.login-screen { display: grid }` CSS overrode `[hidden]` attribute.  
**Fix:** Added `[hidden] { display: none !important; }` to `styles.css`.

### Sommaire links redirected to Notion (fixed)
**Cause:** Notion exports TOC links as absolute Notion URLs.  
**Fix:** Post-process rendered HTML to rewrite Notion hrefs to `#slug` anchors; also handle plain-text `<li>` items that weren't wrapped in `<a>` tags.

### Search returned irrelevant results (fixed)
**Fix:** Rewrote scoring with field weights, phrase match bonus, all-terms bonus, and a mismatch penalty.

### AI replied in English despite French input (fixed)
**Fix:** Added explicit language rule to the system prompt: "reply in the SAME language as the user's message." Bumped `promptVersion` to 2 to auto-upgrade saved prompts.

### Multi-device sync not working locally (fix required)
**Cause:** `php -S` is single-threaded. Long-poll holds the only thread; other requests time out.  
**Fix:** `$env:PHP_CLI_SERVER_WORKERS = 8; php -S 0.0.0.0:8000` (or `.\serve.ps1`).  
**On XAMPP/Apache:** not an issue — Apache is multi-process.

### Session logs out on refresh (partially fixed)
**Cause:** PHP session cookie not being sent back to the browser, or `php -S` session file issues.  
**Fix in progress:** `localStorage.irh_auth_v1` flag ensures single-device mode survives refresh. For full server-mode persistence, deploy to Apache (XAMPP/Hostinger).

---

## 13. Deployment

### XAMPP (local testing, recommended over php -S)
1. Copy the entire project folder into `C:\xampp\htdocs\irh\`
2. Start Apache in XAMPP Control Panel.
3. Open `http://localhost/irh/`
4. `data/` folder must be writable — XAMPP usually allows this by default on Windows.
5. Multi-device sync will work natively (Apache is multi-process).

### Hostinger (production)
1. Upload all files to `public_html/` (or a subfolder) via File Manager or FTP.
2. Ensure `data/` has write permission (755 or 777 if needed).
3. `data/.htaccess` is already included — it blocks direct browser access to `chat.json`.
4. PHP 8 is included on all Hostinger plans — no configuration needed.
5. Visit `https://yourdomain.com/` — the app works immediately.

### Files required on server
```
index.html
styles.css
api.php
data/            ← must be writable by web server user
data/.htaccess
js/ (all files)
files/ (all markdown + images + PDF)
```

### Cache busting
All JS and CSS files are versioned with `?v=7`. When you modify any of these files, bump the version number in `index.html` to force browsers to reload.

---

## 14. Credentials & Keys

> **All secrets are stored in `.env` (gitignored). Never commit that file.**

| Item | Where to find it |
|------|-----------------|
| App username | `.env` → `APP_USERNAME` |
| App password | `.env` → `APP_PASSWORD` |
| Groq API key | `.env` → `GROQ_API_KEY` |
| Groq model | `.env` → `GROQ_MODEL` |
| Groq endpoint | `.env` → `GROQ_ENDPOINT` |

---

## 15. Pending Work & Future Ideas

### High priority
- [ ] **Fix session persistence on dev server** — after XAMPP move this should resolve itself. If not, investigate PHP session save path and cookie domain.
- [ ] **Move Groq API call to api.php** — to hide the API key from browser source. The JS `ChatStore.send()` would POST to `api.php?action=chat` instead of directly to Groq.

### Medium priority
- [ ] **Conversation rename UI** — double-click conversation title to rename.
- [ ] **Export chat as markdown** — download button in chat window.
- [ ] **Search within PDF** — currently Angular PDF shows as embedded viewer only.
- [ ] **Mobile responsive sidebar** — sidebar collapses to a hamburger menu on small screens.

### Low priority / Ideas
- [ ] **Syntax copy button** — "Copy" button on code blocks.
- [ ] **Multiple users** — extend `api.php` to support user-scoped conversations (separate JSON files per user).
- [ ] **Markdown editing** — edit/annotate sections directly in the app.

---

## Appendix: Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| No npm / no build step | User requirement: pure HTML/CSS/JS, deployable by drag-and-drop |
| JSON file instead of database | User requirement: no DB |
| Long-polling instead of WebSockets | Shared hosting (Hostinger) doesn't support WebSockets; long-polling works everywhere with PHP |
| `flock()` for concurrency | Prevents race conditions when two devices write simultaneously |
| Atomic write (tmp + rename) | Prevents reading a partially-written file |
| `session_write_close()` before poll loop | PHP's default per-session lock would block all other requests from the same client without this |
| localStorage fallback | Ensures the app still works if PHP is not available (e.g., `python -m http.server`) |
| `promptVersion` bump mechanism | Auto-upgrades saved system prompts when the default is improved, without breaking user customisation |

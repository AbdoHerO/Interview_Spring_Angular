# Interview Revision Hub

A polished, single-user web app to review your Java / Spring / Angular interview material with full-text search and a Groq-powered AI chat.

## ✨ Features

- 🔐 Server-side login (PHP session) with local fallback when no backend
- 📚 Sections: Concepts (Business Manager, Java 8/17, Spring Boot, Angular PDF) + Q&A (Java, Spring/Microservice/Batch)
- 🖼️ Renders Notion-exported markdown including images
- 🔎 Smart search ranked by relevance — matches in headings rank higher, with grouped results and snippet previews
- 💬 AI chat (Groq · `meta-llama/llama-4-scout-17b-16e-instruct`) with conversation history and editable system prompt
- 🔄 **Real-time multi-device sync** — open the app on two devices, send a message on one, it appears on the other within ~1 s (no refresh). Backed by `data/chat.json` + HTTP long polling. No database.
- ⌨️ Press <kbd>/</kbd> to focus search, <kbd>↑</kbd>/<kbd>↓</kbd> to navigate results, <kbd>Enter</kbd> to open

## 🚀 Run

The app needs PHP for chat sync between devices. Without PHP, the app still works — chat history is just kept locally per browser.

### Option A — PHP built-in server (recommended for local dev)

⚠️ The default `php -S` is **single-threaded** — long-polling will block other requests, so chat sync between two browsers won't work. Always set `PHP_CLI_SERVER_WORKERS` to allow concurrent requests:

```powershell
cd "C:\Users\abder\Documents\___Abdou_GIT\revesion_Java_Spring_Angular"
$env:PHP_CLI_SERVER_WORKERS = 8
php -S 0.0.0.0:8000
```

Or just run the helper script:
```powershell
.\serve.ps1
```
Open <http://localhost:8000>

### Option B — Python (no chat sync, single-device only)
```powershell
python -m http.server 8000
```

### Option C — VS Code Live Server
Right-click `index.html` → **Open with Live Server** (no chat sync; PHP not executed).

## 🌐 Deploy to Hostinger (or any shared PHP host)

1. Upload the entire project folder via the **File Manager** or FTP into your domain's `public_html/` (or a subfolder of it).
2. Make sure these are on the server:
   - `index.html`, `styles.css`, `js/`, `files/`
   - `api.php`
   - `data/` directory **with write permission** (typically `755` on Hostinger; the app will create `data/chat.json` automatically on the first request)
   - `data/.htaccess` (already included — blocks direct browser access to `chat.json`)
3. Visit `https://yourdomain.com/` — login with the credentials below.
4. Open the app on a second device → both stay in sync via HTTP long-polling.

> Hostinger shared hosting includes PHP 8 by default, so no extra setup is needed.

## 🔑 Login

Credentials live in `.env` (gitignored) and are verified server-side by
`api.php`:

```dotenv
APP_USERNAME=your-username
APP_PASSWORD=your-password
```

There is no hardcoded fallback, and none in `js/config.js` — that file is
served to the browser, so anything in it is public. When `.env` is missing,
`api.php` returns 503 rather than accepting a default.

> ⚠️ An earlier version of this README and of `js/config.js` published a real
> password. It is still in this repository's git history, so that password must
> be considered compromised anywhere it was reused.

## 🛠️ Configuration

Edit `js/config.js` to:
- Add/remove sections (point `path` to your `.md` or `.pdf` files in `files/`)
- Tune the **default** AI system prompt
- Update the Groq API key / model

The active system prompt can also be edited live from the chat (⚙ icon).

## ⚠️ Security note

The Groq API key is exposed in client-side JavaScript — fine for local single-user use, but **do not deploy this publicly** without proxying the API call through a small backend.

## 📁 Project structure

```
index.html
styles.css
api.php          # PHP backend: login + chat sync (long-poll)
data/            # auto-created; chat.json + .htaccess (protected)
js/
  config.js     # credentials, sections, Groq settings
  auth.js       # login/logout (server + local fallback)
  markdown.js   # marked + image base-path rewriting + TOC linking
  search.js     # tokenizer, scoring, snippet & highlight helpers
  chat.js       # server-synced store (long-poll) + Groq client
  app.js        # navigation, search UI, chat UI
files/          # your Notion exports
```

// Chat module: server-synced via api.php (long-poll), with localStorage
// fallback when the PHP backend is not available.
//
// Public surface (used by app.js):
//   ChatStore.init()                   -> loads state, starts polling
//   ChatStore.onChange(fn)             -> subscribe to state updates
//   ChatStore.conversations            -> array
//   ChatStore.activeId                 -> string|null
//   ChatStore.active()                 -> conversation|null
//   ChatStore.newConversation()        -> creates + selects new conv
//   ChatStore.select(id)
//   ChatStore.delete(id)
//   ChatStore.send(text)               -> appends user msg, calls Groq, appends assistant msg
//   ChatStore.getSystemPrompt() / setSystemPrompt(p) / resetSystemPrompt()
(function () {
  // ---- localStorage keys (used as fallback + for client-only prefs) ----
  const HISTORY_KEY    = 'irh_chat_history_v1';
  const PROMPT_KEY     = 'irh_chat_prompt_v1';
  const PROMPT_VER_KEY = 'irh_chat_prompt_ver_v1';
  const ACTIVE_KEY     = 'irh_chat_active_v1';

  function genId() {
    return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function maybeUpgradePrompt() {
    const cfg = window.APP_CONFIG.groq;
    const savedVer = parseInt(localStorage.getItem(PROMPT_VER_KEY) || '0', 10);
    const saved    = localStorage.getItem(PROMPT_KEY);
    if (!saved) {
      localStorage.setItem(PROMPT_VER_KEY, String(cfg.promptVersion || 1));
      return;
    }
    if (savedVer < (cfg.promptVersion || 1)) {
      const looksLikeOldDefault = /DIRECT question\/answer style/i.test(saved) && !/LANGUAGE RULE/i.test(saved);
      if (looksLikeOldDefault) localStorage.setItem(PROMPT_KEY, cfg.defaultSystemPrompt);
      localStorage.setItem(PROMPT_VER_KEY, String(cfg.promptVersion || 1));
    }
  }
  maybeUpgradePrompt();

  // ---- HTTP helpers ----
  async function api(action, body, opts = {}) {
    const init = {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    };
    const url = 'api.php?action=' + encodeURIComponent(action)
      + (opts.query ? '&' + opts.query : '');
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  // ---- Store ----
  const Store = {
    serverMode: false,            // becomes true after first successful API call
    conversations: [],
    activeId: null,
    version: 0,                   // server version, used for long-poll

    _listeners: new Set(),
    _pollAbort: null,

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
    _emit() { this._listeners.forEach((fn) => { try { fn(); } catch {} }); },

    active() { return this.conversations.find((c) => c.id === this.activeId) || null; },

    // ---------- prompt (always client-side) ----------
    getSystemPrompt() {
      return localStorage.getItem(PROMPT_KEY) || window.APP_CONFIG.groq.defaultSystemPrompt;
    },
    setSystemPrompt(p) { localStorage.setItem(PROMPT_KEY, p); },
    resetSystemPrompt() { localStorage.removeItem(PROMPT_KEY); },

    // ---------- local fallback persistence ----------
    _loadLocal() {
      try {
        this.conversations = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      } catch { this.conversations = []; }
      this.activeId = localStorage.getItem(ACTIVE_KEY) || null;
      if (!this.conversations.length || !this.conversations.find((c) => c.id === this.activeId)) {
        const conv = { id: genId(), title: 'New conversation', createdAt: Date.now(), messages: [] };
        this.conversations.unshift(conv);
        this.activeId = conv.id;
        this._saveLocal();
      }
    },
    _saveLocal() {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.conversations));
      if (this.activeId) localStorage.setItem(ACTIVE_KEY, this.activeId);
    },

    _applyServerState(s) {
      if (!s || !Array.isArray(s.conversations)) return;
      this.conversations = s.conversations;
      this.activeId = s.activeId || (this.conversations[0] && this.conversations[0].id) || null;
      this.version  = s.version | 0;
      this._emit();
    },

    // ---------- init ----------
    async init() {
      // Try server
      try {
        const r = await api('state');
        if (r.ok && r.data) {
          this.serverMode = true;
          this._applyServerState(r.data);
          if (!this.conversations.length) await this.newConversation(false);
          this._startPolling();
          this._emit();
          return;
        }
      } catch { /* server unreachable */ }
      // Fallback
      this.serverMode = false;
      this._loadLocal();
      this._emit();
    },

    // ---------- long polling ----------
    async _startPolling() {
      // Cancel any previous loop
      if (this._pollAbort) this._pollAbort.abort();
      const ctrl = new AbortController();
      this._pollAbort = ctrl;

      while (!ctrl.signal.aborted) {
        try {
          const r = await api('poll', null, {
            query: 'since=' + this.version + '&timeout=25',
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted) return;
          if (r.ok && r.data) {
            if (r.data.noChange) {
              // tick the version anyway so subsequent polls reuse same baseline
              if (typeof r.data.version === 'number') this.version = r.data.version;
            } else {
              this._applyServerState(r.data);
            }
          } else if (r.status === 401) {
            // Lost session
            return;
          }
        } catch (e) {
          if (ctrl.signal.aborted) return;
          // Network blip — back off and retry
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
    },

    // ---------- mutations ----------
    async newConversation(emit = true) {
      const id = genId();
      if (this.serverMode) {
        const r = await api('new', { id, title: 'New conversation' });
        if (r.ok && r.data) this._applyServerState(r.data);
      } else {
        this.conversations.unshift({ id, title: 'New conversation', createdAt: Date.now(), messages: [] });
        this.activeId = id;
        this._saveLocal();
        if (emit) this._emit();
      }
      return this.active();
    },

    async select(id) {
      this.activeId = id;
      if (this.serverMode) {
        try { await api('setActive', { id }); } catch {}
      } else {
        localStorage.setItem(ACTIVE_KEY, id);
      }
      this._emit();
    },

    async delete(id) {
      if (this.serverMode) {
        const r = await api('delete', { id });
        if (r.ok && r.data) this._applyServerState(r.data);
      } else {
        this.conversations = this.conversations.filter((c) => c.id !== id);
        if (this.activeId === id) this.activeId = this.conversations[0]?.id || null;
        if (!this.activeId) {
          const conv = { id: genId(), title: 'New conversation', createdAt: Date.now(), messages: [] };
          this.conversations.unshift(conv);
          this.activeId = conv.id;
        }
        this._saveLocal();
        this._emit();
      }
    },

    async _appendMessage(convId, role, content) {
      if (this.serverMode) {
        const r = await api('append', { id: convId, message: { role, content } });
        if (r.ok && r.data) this._applyServerState(r.data);
      } else {
        let conv = this.conversations.find((c) => c.id === convId);
        if (!conv) {
          conv = { id: convId, title: 'New conversation', createdAt: Date.now(), messages: [] };
          this.conversations.unshift(conv);
          this.activeId = convId;
        }
        conv.messages.push({ role, content, ts: Date.now() });
        if (role === 'user' && (!conv.title || conv.title === 'New conversation')) {
          conv.title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
        }
        this._saveLocal();
        this._emit();
      }
    },

    // Send to Groq, persist both messages.
    async send(userText) {
      const conv = this.active();
      if (!conv) throw new Error('No active conversation');
      const cfg = window.APP_CONFIG.groq;
      const systemPrompt = this.getSystemPrompt();

      // Persist user message immediately so other devices see it ASAP.
      await this._appendMessage(conv.id, 'user', userText);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...this.active().messages.map(({ role, content }) => ({ role, content })),
      ];

      // Call via server-side proxy so the API key is never exposed in the browser.
      const res = await fetch('api.php?action=chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.4,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        throw new Error('Groq API error ' + res.status + ': ' + errTxt.slice(0, 300));
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(empty response)';
      await this._appendMessage(conv.id, 'assistant', reply);
      return reply;
    },
  };

  window.ChatStore = Store;
})();

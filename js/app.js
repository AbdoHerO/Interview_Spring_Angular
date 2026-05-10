// Main app glue: routing, navigation, search UI, chat UI.
(function () {
  // ============ DOM ============
  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#login-screen');
  const loginForm = $('#login-form');
  const loginError = $('#login-error');
  const app = $('#app');
  const navConcepts = $('#nav-concepts');
  const navQA = $('#nav-qa');
  const content = $('#content');
  const sectionLabel = $('#current-section-label');
  const quickGrid = $('#quick-grid');
  const logoutBtn = $('#logout-btn');

  const searchInput = $('#search-input');
  const searchResultsEl = $('#search-results');

  // Chat
  const chatToggle = $('#chat-toggle');
  const chatWindow = $('#chat-window');
  const chatClose = $('#chat-close');
  const chatNew = $('#chat-new');
  const chatHistoryBtn = $('#chat-history-btn');
  const chatPromptBtn = $('#chat-prompt-btn');
  const chatHistoryPanel = $('#chat-history-panel');
  const chatHistoryClose = $('#chat-history-close');
  const chatHistoryList = $('#chat-history-list');
  const chatPromptPanel = $('#chat-prompt-panel');
  const chatSystemPrompt = $('#chat-system-prompt');
  const chatPromptSave = $('#chat-prompt-save');
  const chatPromptReset = $('#chat-prompt-reset');
  const chatMessages = $('#chat-messages');
  const chatForm = $('#chat-form');
  const chatInput = $('#chat-input');

  let currentSectionId = null;

  // ============ AUTH FLOW ============
  function showLogin() {
    loginScreen.hidden = false;
    app.hidden = true;
  }
  function showApp() {
    loginScreen.hidden = true;
    app.hidden = false;
    initApp();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const u = $('#login-user').value.trim();
      const p = $('#login-pass').value;
      const ok = await window.Auth.login(u, p);
      if (ok) {
        loginError.hidden = true;
        showApp();
      } else {
        loginError.textContent = 'Invalid credentials. Please try again.';
        loginError.hidden = false;
      }
    } catch (err) {
      loginError.textContent = 'Login error: ' + err.message;
      loginError.hidden = false;
      console.error('Login error:', err);
    } finally {
      submitBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await window.Auth.logout();
    location.reload();
  });

  // ============ NAVIGATION ============
  function buildNav() {
    const cfg = window.APP_CONFIG.sections;
    navConcepts.innerHTML = '';
    navQA.innerHTML = '';

    cfg.concepts.forEach((s) => navConcepts.appendChild(navItem(s)));
    cfg.qa.forEach((s) => navQA.appendChild(navItem(s)));

    quickGrid.innerHTML = '';
    [...cfg.concepts, ...cfg.qa].forEach((s) => {
      const card = document.createElement('div');
      card.className = 'quick-card';
      card.innerHTML = `
        <div class="qc-tag">${cfg.concepts.includes(s) ? 'Concept' : 'Q & A'}</div>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.description || '')}</p>
      `;
      card.addEventListener('click', () => openSection(s.id));
      quickGrid.appendChild(card);
    });
  }

  function navItem(s) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.dataset.id = s.id;
    btn.innerHTML = `<span class="nav-dot"></span><span>${escapeHtml(s.title)}</span>`;
    btn.addEventListener('click', () => openSection(s.id));
    li.appendChild(btn);
    return li;
  }

  function setActiveNav(id) {
    document.querySelectorAll('.nav li button').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === id);
    });
  }

  function findSection(id) {
    const cfg = window.APP_CONFIG.sections;
    return [...cfg.concepts, ...cfg.qa].find((s) => s.id === id);
  }

  async function openSection(id, anchor, headingText) {
    const section = findSection(id);
    if (!section) return;
    currentSectionId = id;
    setActiveNav(id);
    sectionLabel.textContent = section.title;

    if (section.type === 'pdf') {
      content.innerHTML = `
        <div class="markdown">
          <h1>${escapeHtml(section.title)}</h1>
          <p class="muted">${escapeHtml(section.description || '')}</p>
          <embed class="pdf-viewer" src="${section.path}#view=FitH" type="application/pdf" />
          <p class="muted small">Can't see the PDF? <a href="${section.path}" target="_blank" rel="noopener">Open in new tab</a>.</p>
        </div>`;
      return;
    }

    content.innerHTML = `<div class="markdown"><p class="muted">Loading…</p></div>`;
    try {
      const md = await window.MD.loadMarkdown(section.path);
      const html = window.MD.renderMarkdown(md, section.basePath);
      content.innerHTML = `<div class="markdown">${html}</div>`;
      // Intercept in-page anchor clicks so we scroll smoothly inside the content pane
      content.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (ev) => {
          const id = a.getAttribute('href').slice(1);
          if (!id) { ev.preventDefault(); return; }
          const target = document.getElementById(id);
          if (target) {
            ev.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', '#' + id);
          }
        });
      });
      content.scrollTop = 0;
      if (anchor || headingText) {
        setTimeout(() => {
          let el = anchor ? document.getElementById(anchor) : null;
          if (!el && headingText) {
            const norm = (s) => (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
            const target = norm(headingText);
            const headings = content.querySelectorAll('h1, h2, h3, h4');
            for (const h of headings) {
              if (norm(h.textContent) === target) { el = h; break; }
            }
          }
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } catch (e) {
      content.innerHTML = `<div class="markdown"><h2>Failed to load</h2><p class="muted">${escapeHtml(e.message)}</p><p class="muted small">If you opened this file directly with <code>file://</code>, please serve the folder via a local web server (see README).</p></div>`;
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============ SEARCH ============
  let searchActiveIdx = -1;
  let lastResults = [];

  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  function renderResults(query, results) {
    if (!query.trim()) {
      searchResultsEl.hidden = true;
      return;
    }
    if (!results.length) {
      searchResultsEl.hidden = false;
      searchResultsEl.innerHTML = `<div class="search-empty">No matches for "<strong>${escapeHtml(query)}</strong>"</div>`;
      return;
    }

    // Group by section
    const groups = {};
    for (const r of results) {
      const key = r.block.sectionTitle;
      (groups[key] = groups[key] || []).push(r);
    }

    let html = '';
    for (const [secTitle, items] of Object.entries(groups)) {
      html += `<div class="sr-section-head">${escapeHtml(secTitle)}</div>`;
      items.forEach((r, i) => {
        const idx = lastResults.indexOf(r);
        const snip = window.SearchIndex.snippet(r.block.text, query);
        html += `
          <div class="search-result" data-idx="${idx}">
            <div class="sr-title">${window.SearchIndex.highlight(r.block.heading, query)}</div>
            <div class="sr-meta">${escapeHtml(r.block.group)} · score ${r.score.toFixed(1)}</div>
            <div class="sr-snippet">${window.SearchIndex.highlight(snip, query)}</div>
          </div>`;
      });
    }
    searchResultsEl.innerHTML = html;
    searchResultsEl.hidden = false;
    searchResultsEl.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        const r = lastResults[idx];
        if (r) jumpToResult(r);
      });
    });
  }

  function jumpToResult(r) {
    searchResultsEl.hidden = true;
    searchInput.blur();
    openSection(r.block.sectionId, r.block.anchor, r.block.heading);
  }

  const onSearch = debounce(() => {
    const q = searchInput.value;
    if (!window.SearchIndex.ready) return;
    lastResults = window.SearchIndex.score(q);
    searchActiveIdx = -1;
    renderResults(q, lastResults);
  }, 120);

  searchInput.addEventListener('input', onSearch);
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) onSearch();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) searchResultsEl.hidden = true;
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = searchResultsEl.querySelectorAll('.search-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      searchActiveIdx = Math.min(items.length - 1, searchActiveIdx + 1);
      updateActiveResult(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      searchActiveIdx = Math.max(0, searchActiveIdx - 1);
      updateActiveResult(items);
    } else if (e.key === 'Enter') {
      if (searchActiveIdx >= 0 && items[searchActiveIdx]) {
        e.preventDefault();
        const idx = parseInt(items[searchActiveIdx].dataset.idx, 10);
        const r = lastResults[idx];
        if (r) jumpToResult(r);
      } else if (lastResults[0]) {
        e.preventDefault();
        jumpToResult(lastResults[0]);
      }
    } else if (e.key === 'Escape') {
      searchResultsEl.hidden = true;
      searchInput.blur();
    }
  });

  function updateActiveResult(items) {
    items.forEach((el, i) => el.classList.toggle('active', i === searchActiveIdx));
    if (items[searchActiveIdx]) items[searchActiveIdx].scrollIntoView({ block: 'nearest' });
  }

  // Global "/" shortcut to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // ============ CHAT UI ============
  function openChat() {
    chatWindow.hidden = false;
    renderChatMessages();
    chatInput.focus();
  }
  function closeChat() { chatWindow.hidden = true; }
  chatToggle.addEventListener('click', () => (chatWindow.hidden ? openChat() : closeChat()));
  chatClose.addEventListener('click', closeChat);

  chatNew.addEventListener('click', async () => {
    await window.ChatStore.newConversation();
    // Re-render is triggered by the store's onChange listener
  });

  chatHistoryBtn.addEventListener('click', () => {
    chatPromptPanel.hidden = true;
    chatHistoryPanel.hidden = !chatHistoryPanel.hidden;
    if (!chatHistoryPanel.hidden) renderChatHistoryList();
  });
  chatHistoryClose.addEventListener('click', () => (chatHistoryPanel.hidden = true));

  chatPromptBtn.addEventListener('click', () => {
    chatHistoryPanel.hidden = true;
    chatPromptPanel.hidden = !chatPromptPanel.hidden;
    if (!chatPromptPanel.hidden) {
      chatSystemPrompt.value = window.ChatStore.getSystemPrompt();
    }
  });
  chatPromptSave.addEventListener('click', () => {
    window.ChatStore.setSystemPrompt(chatSystemPrompt.value.trim());
    chatPromptPanel.hidden = true;
  });
  chatPromptReset.addEventListener('click', () => {
    window.ChatStore.resetSystemPrompt();
    chatSystemPrompt.value = window.ChatStore.getSystemPrompt();
  });

  function renderChatHistoryList() {
    const conv = window.ChatStore.conversations;
    chatHistoryList.innerHTML = '';
    conv.forEach((c) => {
      const li = document.createElement('li');
      if (c.id === window.ChatStore.activeId) li.classList.add('active');
      li.innerHTML = `<span class="conv-title">${escapeHtml(c.title)}</span><button class="conv-del" title="Delete">✕</button>`;
      li.querySelector('.conv-title').addEventListener('click', async () => {
        await window.ChatStore.select(c.id);
        chatHistoryPanel.hidden = true;
      });
      li.querySelector('.conv-del').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await window.ChatStore.delete(c.id);
      });
      chatHistoryList.appendChild(li);
    });
  }

  // Track which message indexes are already rendered for the current conversation
  // so live updates can append incrementally without losing scroll position.
  let renderedConvId = null;
  let renderedCount = 0;

  function renderChatMessages() {
    const conv = window.ChatStore.active();
    chatMessages.innerHTML = '';
    renderedConvId = conv?.id || null;
    renderedCount = 0;
    if (!conv || !conv.messages.length) {
      chatMessages.innerHTML = `<div class="msg assistant"><div class="markdown"><p>Hi! Ask me anything about Java, Spring, Angular… I'll keep it short and direct.</p></div></div>`;
      return;
    }
    conv.messages.forEach((m) => addMessageToDOM(m.role, m.content, false));
    renderedCount = conv.messages.length;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // React to live updates from the server (long-poll) or local mutations.
  function onStoreChange() {
    // History panel: refresh if visible
    if (!chatHistoryPanel.hidden) renderChatHistoryList();

    // Chat window: only refresh if open
    if (chatWindow.hidden) return;

    const conv = window.ChatStore.active();
    if (!conv) { renderChatMessages(); return; }

    // Different conversation became active -> full re-render
    if (conv.id !== renderedConvId) { renderChatMessages(); return; }

    // Same conversation, append any new messages incrementally
    const isAtBottom = (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) < 80;
    if (renderedCount === 0 && conv.messages.length > 0) {
      // Replace the welcome bubble
      chatMessages.innerHTML = '';
    }
    for (let i = renderedCount; i < conv.messages.length; i++) {
      const m = conv.messages[i];
      addMessageToDOM(m.role, m.content, false);
    }
    renderedCount = conv.messages.length;
    if (isAtBottom) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addMessageToDOM(role, content, scroll = true) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    if (role === 'assistant') {
      const parsed = (typeof marked !== 'undefined' && typeof marked.parse === 'function')
        ? marked.parse(content)
        : content.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      el.innerHTML = `<div class="markdown">${parsed}</div>`;
    } else {
      el.textContent = content;
    }
    chatMessages.appendChild(el);
    if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
    return el;
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';

    // typing indicator (will be replaced when assistant message arrives via onChange)
    const typing = document.createElement('div');
    typing.className = 'msg assistant typing-bubble';
    typing.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      await window.ChatStore.send(text);
      // The store emits change events for both the user and assistant messages,
      // so they're already rendered. Just remove the typing indicator.
      typing.remove();
    } catch (err) {
      typing.remove();
      const errEl = document.createElement('div');
      errEl.className = 'msg error';
      errEl.textContent = err.message;
      chatMessages.appendChild(errEl);
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // ============ INIT ============
  async function initApp() {
    buildNav();
    chatSystemPrompt.value = window.ChatStore.getSystemPrompt();

    // Subscribe to chat store updates BEFORE init() so we catch initial state
    window.ChatStore.onChange(onStoreChange);
    await window.ChatStore.init();

    // Build search index in background
    searchInput.placeholder = 'Indexing content…';
    try {
      await window.SearchIndex.build();
      searchInput.placeholder = 'Search keywords, questions or concepts…';
    } catch (e) {
      searchInput.placeholder = 'Search (index failed)';
      console.error(e);
    }
  }

  // ============ BOOT ============
  (async () => {
    if (await window.Auth.isAuthenticated()) {
      showApp();
    } else {
      showLogin();
    }
  })();
})();

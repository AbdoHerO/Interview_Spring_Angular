// ============================================================================
// AI Interview Simulator — self-contained frontend module.
//
// Talks to ai_proxy.php (PHP) which proxies to the Python AI service.
// Reuses the existing PHP session cookie (credentials: 'include').
//
// Public surface:
//   InterviewSim.init()   — called once after login (app.js bootstraps DOM)
//
// This module:
//   • injects a new "AI Interview" group into the sidebar nav
//   • renders the simulator UI into #content
//   • does NOT modify any existing module
// ============================================================================
(function () {
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const PROXY = 'ai_proxy.php';

  // -------- HTTP helpers --------
  async function api(action, { method = 'GET', json, form, query } = {}) {
    const qs = Object.assign({ action }, query || {});
    const url = PROXY + '?' + new URLSearchParams(qs).toString();
    const init = { method, credentials: 'include' };
    if (json !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(json);
    } else if (form) {
      init.body = form;
    }
    const r = await fetch(url, init);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!r.ok) {
      const msg = (data && (data.error || data.detail)) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // -------- session state held in memory + sessionStorage so reloads survive --------
  const SK = 'irh_interview_session_v1';
  let current = null;   // { session_id, mode, ... }

  function persist() {
    try {
      if (current) sessionStorage.setItem(SK, JSON.stringify(current));
      else sessionStorage.removeItem(SK);
    } catch {}
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem(SK);
      if (raw) current = JSON.parse(raw);
    } catch {}
  }

  // -------- sidebar injection --------
  function injectNav() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.querySelector('[data-irh-interview-nav]')) return;
    const group = document.createElement('div');
    group.className = 'nav-group';
    group.dataset.irhInterviewNav = '1';
    group.innerHTML = `
      <div class="nav-title">AI Interview</div>
      <ul>
        <li><button data-irh-action="open-simulator"><span class="nav-dot"></span><span>Interview Simulator</span></button></li>
      </ul>
    `;
    nav.appendChild(group);
    group.querySelector('[data-irh-action="open-simulator"]')
         .addEventListener('click', renderSimulator);
  }

  // -------- main UI --------
  function renderSimulator() {
    const content = $('#content');
    const label = $('#current-section-label');
    if (label) label.textContent = 'AI Interview Simulator';
    document.querySelectorAll('.nav li button').forEach(b => b.classList.remove('active'));

    content.innerHTML = `
      <div class="irh-sim markdown">
        <h1>AI Interview Simulator</h1>
        <p class="muted">RAG-powered technical interviewer. Choose a mode, optionally upload a project, then start.</p>

        <div class="irh-grid">
          <section class="irh-card">
            <h3>1 — Configure</h3>
            <label>Mode
              <select id="irh-mode">
                <option value="technical">Technical (Java / Spring / Angular …)</option>
                <option value="project_defense">Project defense (upload / repo)</option>
                <option value="hr">HR / behavioural</option>
                <option value="coding">Live coding</option>
              </select>
            </label>
            <label>Difficulty
              <select id="irh-difficulty">
                <option value="junior">Junior</option>
                <option value="mid" selected>Mid</option>
                <option value="senior">Senior</option>
                <option value="staff">Staff</option>
              </select>
            </label>
            <label>Language
              <select id="irh-language">
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
            <label>Topics (comma-separated)
              <input id="irh-topics" type="text" placeholder="spring-boot, jpa, kafka, security" />
            </label>
          </section>

          <section class="irh-card" id="irh-source-card">
            <h3>2 — Project source <span class="muted small">(required for project defense)</span></h3>
            <div class="irh-source-tabs">
              <button class="irh-tab active" data-tab="repo">GitHub repo</button>
              <button class="irh-tab" data-tab="file">Upload file</button>
              <button class="irh-tab" data-tab="zip">Upload ZIP</button>
            </div>
            <div data-pane="repo" class="irh-pane">
              <input id="irh-repo-url" type="url" placeholder="https://github.com/user/project" />
              <input id="irh-repo-branch" type="text" placeholder="branch (optional)" />
              <button id="irh-analyze-repo" class="btn-primary">Analyze repository</button>
            </div>
            <div data-pane="file" class="irh-pane" hidden>
              <input id="irh-file" type="file" accept=".md,.txt,.pdf,.docx,.java,.js,.ts,.html,.css,.json,.yml,.yaml,.xml" />
              <button id="irh-upload-file" class="btn-primary">Upload &amp; index</button>
            </div>
            <div data-pane="zip" class="irh-pane" hidden>
              <input id="irh-zip" type="file" accept=".zip" />
              <button id="irh-upload-zip" class="btn-primary">Upload ZIP &amp; index</button>
            </div>
            <div id="irh-source-status" class="irh-status muted small"></div>
          </section>
        </div>

        <div class="irh-actions">
          <button id="irh-start" class="btn-primary">Start interview</button>
          <button id="irh-resume" class="btn-ghost" hidden>Resume previous</button>
        </div>

        <section id="irh-room" class="irh-room" hidden></section>
        <section id="irh-report" class="irh-report" hidden></section>
      </div>
    `;

    // tab switching
    $$('.irh-tab', content).forEach(t => t.addEventListener('click', () => {
      $$('.irh-tab', content).forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const want = t.dataset.tab;
      $$('.irh-pane', content).forEach(p => p.hidden = p.dataset.pane !== want);
    }));

    $('#irh-analyze-repo').addEventListener('click', onAnalyzeRepo);
    $('#irh-upload-file').addEventListener('click', () => onUpload($('#irh-file'), 'file'));
    $('#irh-upload-zip').addEventListener('click', () => onUpload($('#irh-zip'), 'zip'));
    $('#irh-start').addEventListener('click', onStart);
    $('#irh-resume').addEventListener('click', resumeIfAny);

    restore();
    if (current && current.session_id) {
      $('#irh-resume').hidden = false;
    }
  }

  // -------- source ingestion --------
  let lastSource = null;  // {source_id, name, technologies, summary}

  async function onAnalyzeRepo() {
    const url = $('#irh-repo-url').value.trim();
    const branch = $('#irh-repo-branch').value.trim() || null;
    if (!url) return alert('Repository URL required');
    setStatus('Cloning and analyzing repository… (this can take a minute)');
    try {
      const res = await api('analyze-repository', { method: 'POST', json: { url, branch } });
      lastSource = res;
      setStatus(`✓ Indexed ${res.chunks} chunks from ${res.name}. Technologies: ${(res.technologies||[]).join(', ') || '—'}`);
      if (res.summary) showBrief(res.summary);
    } catch (e) { setStatus('✗ ' + e.message, true); }
  }

  async function onUpload(input, kind) {
    const f = input.files && input.files[0];
    if (!f) return alert('Choose a file first');
    setStatus(`Uploading ${f.name}…`);
    const form = new FormData();
    form.append('file', f);
    form.append('kind', kind);
    try {
      const res = await api('upload', { method: 'POST', form });
      lastSource = res;
      setStatus(`✓ Indexed ${res.chunks} chunks from ${res.name}. Technologies: ${(res.technologies||[]).join(', ') || '—'}`);
    } catch (e) { setStatus('✗ ' + e.message, true); }
  }

  function setStatus(msg, isErr) {
    const el = $('#irh-source-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isErr ? '#e66' : '';
  }

  function showBrief(md) {
    const room = $('#irh-room');
    room.hidden = false;
    room.innerHTML = `
      <h3>Repository analysis brief</h3>
      <div class="irh-brief markdown">${window.MD ? window.MD.renderMarkdown(md, '') : md}</div>
    `;
  }

  // -------- interview --------
  async function onStart() {
    const mode = $('#irh-mode').value;
    const difficulty = $('#irh-difficulty').value;
    const language = $('#irh-language').value;
    const topics = $('#irh-topics').value.split(',').map(s => s.trim()).filter(Boolean);
    if (mode === 'project_defense' && !lastSource) {
      return alert('Please upload a file / ZIP or analyze a repository first.');
    }
    try {
      const res = await api('start-interview', {
        method: 'POST',
        json: {
          mode, difficulty, language, topics,
          source_id: lastSource ? lastSource.source_id : null,
        },
      });
      current = { session_id: res.session_id, mode, language, turns: [] };
      persist();
      renderRoom(res.opening_question);
    } catch (e) { alert(e.message); }
  }

  async function resumeIfAny() {
    if (!current || !current.session_id) return;
    try {
      const st = await api('interview-state', { query: { session_id: current.session_id } });
      const last = [...st.transcript].reverse().find(t => t.role === 'interviewer');
      renderRoom(last ? last.content : '(no prior question found)', st);
    } catch (e) { alert(e.message); }
  }

  function renderRoom(openingQuestion, restoredState) {
    const room = $('#irh-room');
    room.hidden = false;
    room.innerHTML = `
      <h3>Interview in progress <span class="muted small" id="irh-turns"></span></h3>
      <div id="irh-transcript" class="irh-transcript"></div>
      <form id="irh-answer-form" class="irh-answer-form">
        <textarea id="irh-answer" rows="4" placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"></textarea>
        <div class="row">
          <button type="submit" class="btn-primary">Send</button>
          <button type="button" id="irh-finish" class="btn-ghost">End &amp; score</button>
        </div>
      </form>
    `;
    if (restoredState && restoredState.transcript) {
      restoredState.transcript.forEach(t =>
        appendTurn(t.role === 'interviewer' ? 'interviewer' : 'candidate', t.content));
      updateTurnCounter(restoredState.turn_index, restoredState.max_turns);
    } else {
      appendTurn('interviewer', openingQuestion);
      updateTurnCounter(0, 12);
    }

    const ta = $('#irh-answer');
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('#irh-answer-form').requestSubmit();
      }
    });
    $('#irh-answer-form').addEventListener('submit', onAnswerSubmit);
    $('#irh-finish').addEventListener('click', onFinish);
  }

  function appendTurn(who, content) {
    const t = document.createElement('div');
    t.className = 'irh-turn irh-' + who;
    const body = window.MD ? window.MD.renderMarkdown(content, '') : escapeHtml(content);
    t.innerHTML = `<div class="irh-who">${who === 'interviewer' ? 'Interviewer' : 'You'}</div><div class="irh-body markdown">${body}</div>`;
    $('#irh-transcript').appendChild(t);
    t.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function updateTurnCounter(i, max) {
    const el = $('#irh-turns');
    if (el) el.textContent = `· turn ${i}/${max}`;
  }

  async function onAnswerSubmit(e) {
    e.preventDefault();
    const ta = $('#irh-answer');
    const ans = ta.value.trim();
    if (!ans) return;
    appendTurn('candidate', ans);
    ta.value = '';
    ta.disabled = true;
    try {
      const res = await api('answer', {
        method: 'POST',
        json: { session_id: current.session_id, answer: ans },
      });
      if (res.evaluation) renderEvaluation(res.evaluation);
      updateTurnCounter(res.state.turn_index, res.state.max_turns);
      if (res.done) {
        appendTurn('interviewer', '_(end of interview — generating final score…)_');
        onFinish();
      } else {
        appendTurn('interviewer', res.next_question);
      }
    } catch (err) {
      appendTurn('interviewer', '⚠️ ' + err.message);
    } finally {
      ta.disabled = false;
      ta.focus();
    }
  }

  function renderEvaluation(ev) {
    const t = document.createElement('div');
    t.className = 'irh-eval muted small';
    t.innerHTML = `
      <strong>Evaluation:</strong>
      acc ${ev.technical_accuracy} ·
      clarity ${ev.clarity} ·
      depth ${ev.depth} ·
      best-practices ${ev.best_practices} ·
      confidence ${ev.confidence}
      <div>${escapeHtml(ev.feedback || '')}</div>
    `;
    $('#irh-transcript').appendChild(t);
  }

  async function onFinish() {
    if (!current || !current.session_id) return;
    try {
      const score = await api('score-interview', {
        method: 'POST', query: { session_id: current.session_id },
      });
      renderReport(score);
    } catch (e) { alert(e.message); }
  }

  function renderReport(s) {
    const r = $('#irh-report');
    r.hidden = false;
    r.innerHTML = `
      <h3>Final report</h3>
      <div class="irh-score">
        <div class="irh-score-big">${s.final_score.toFixed(1)} <span class="muted small">/ 10</span></div>
        <div class="irh-score-rec">Recommendation: <strong>${escapeHtml(s.recommendation)}</strong></div>
      </div>
      <table class="irh-score-table">
        <tr><td>Technical accuracy</td><td>${s.technical_accuracy}</td></tr>
        <tr><td>Clarity</td><td>${s.clarity}</td></tr>
        <tr><td>Depth</td><td>${s.depth}</td></tr>
        <tr><td>Best practices</td><td>${s.best_practices}</td></tr>
        <tr><td>Confidence</td><td>${s.confidence}</td></tr>
      </table>
      <div class="irh-strengths"><strong>Strengths</strong><ul>${(s.strengths||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div class="irh-weaknesses"><strong>Weaknesses</strong><ul>${(s.weaknesses||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <button id="irh-export" class="btn-ghost small">Export JSON</button>
    `;
    $('#irh-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `interview-report-${Date.now()}.json`;
      a.click();
    });
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g,
      c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // -------- bootstrap: wait until app is shown (sidebar exists) --------
  function tryInit() {
    if (document.querySelector('.sidebar .nav')) {
      injectNav();
      return true;
    }
    return false;
  }

  window.InterviewSim = {
    init() {
      if (tryInit()) return;
      const obs = new MutationObserver(() => { if (tryInit()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };

  // auto-init on DOM ready (safe; idempotent)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.InterviewSim.init());
  } else {
    window.InterviewSim.init();
  }
})();

// Quiz / Mock Test module.
// Loads a question bank JSON, renders a one-question-at-a-time UI,
// scores at the end and supports MCQ, multi-select, true/false, open answers.
// Open answers are graded by AI via api.php?action=grade-open (falls back to local keyword check).
(function () {
  const STATE = {
    test: null,        // full test object
    sectionId: null,   // current section id (used for storage key)
    answers: {},       // qid -> user answer
    index: 0,
    submitted: false,
    grades: {},        // qid -> { correct, awarded, comment }
  };

  function storageKey(sectionId) { return 'irh_quiz_' + sectionId; }

  function loadProgress(sectionId) {
    try {
      const raw = localStorage.getItem(storageKey(sectionId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveProgress() {
    try {
      localStorage.setItem(storageKey(STATE.sectionId), JSON.stringify({
        answers: STATE.answers,
        index: STATE.index,
        submitted: STATE.submitted,
        grades: STATE.grades,
      }));
    } catch {}
  }
  function clearProgress(sectionId) {
    try { localStorage.removeItem(storageKey(sectionId)); } catch {}
  }

  async function fetchTest(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load test (' + res.status + ')');
    return await res.json();
  }

  // ---------- public entry ----------
  async function open(section, container) {
    container.innerHTML = `<div class="quiz"><p class="muted">Loading test…</p></div>`;
    let test;
    try {
      test = await fetchTest(section.path);
    } catch (e) {
      container.innerHTML = `<div class="quiz"><h2>Failed to load test</h2><p class="muted">${escapeHtml(e.message)}</p></div>`;
      return;
    }

    STATE.test = test;
    STATE.sectionId = section.id;
    const saved = loadProgress(section.id);
    if (saved) {
      STATE.answers   = saved.answers   || {};
      STATE.index     = saved.index     || 0;
      STATE.submitted = !!saved.submitted;
      STATE.grades    = saved.grades    || {};
    } else {
      STATE.answers = {};
      STATE.index = 0;
      STATE.submitted = false;
      STATE.grades = {};
    }

    if (STATE.submitted) renderResults(container);
    else renderIntro(container);
  }

  // ---------- intro / start screen ----------
  function renderIntro(container) {
    const t = STATE.test;
    const L = i18n(t.lang);
    const hasProgress = Object.keys(STATE.answers).length > 0;
    container.innerHTML = `
      <div class="quiz quiz-intro">
        <h1>${escapeHtml(t.title)}</h1>
        <p class="muted">${escapeHtml(t.description || '')}</p>
        <ul class="quiz-meta">
          <li><strong>${t.questions.length}</strong> ${L.questions}</li>
          <li>${L.passingScore}: <strong>${(t.passingScore && t.passingScore <= 1 ? Math.round(t.passingScore*100) : (t.passingScore || 60))}%</strong></li>
          <li>${L.typesLine}</li>
        </ul>
        <div class="quiz-actions">
          <button class="btn-primary" id="quiz-start">${hasProgress ? L.resume : L.start}</button>
          ${hasProgress ? `<button class="btn-ghost" id="quiz-restart">${L.restart}</button>` : ''}
        </div>
      </div>
    `;
    container.querySelector('#quiz-start')?.addEventListener('click', () => renderQuestion(container));
    container.querySelector('#quiz-restart')?.addEventListener('click', () => {
      clearProgress(STATE.sectionId);
      STATE.answers = {}; STATE.index = 0; STATE.submitted = false; STATE.grades = {};
      renderQuestion(container);
    });
  }

  // ---------- single question screen ----------
  function renderQuestion(container) {
    const t = STATE.test;
    const i = STATE.index;
    const q = t.questions[i];
    const total = t.questions.length;
    const userAnswer = STATE.answers[q.id];

    let body = '';
    if (q.type === 'mcq') {
      body = q.options.map((opt, idx) => `
        <label class="quiz-option ${userAnswer === idx ? 'selected' : ''}">
          <input type="radio" name="opt" value="${idx}" ${userAnswer === idx ? 'checked' : ''} />
          <span>${escapeHtml(opt)}</span>
        </label>
      `).join('');
    } else if (q.type === 'multi') {
      const set = new Set(Array.isArray(userAnswer) ? userAnswer : []);
      body = q.options.map((opt, idx) => `
        <label class="quiz-option ${set.has(idx) ? 'selected' : ''}">
          <input type="checkbox" value="${idx}" ${set.has(idx) ? 'checked' : ''} />
          <span>${escapeHtml(opt)}</span>
        </label>
      `).join('');
    } else if (q.type === 'truefalse') {
      const L0 = i18n(t.lang);
      body = [L0.true, L0.false].map((label, idx) => {
        const val = idx === 0;
        const sel = userAnswer === val;
        return `
          <label class="quiz-option ${sel ? 'selected' : ''}">
            <input type="radio" name="opt" value="${val}" ${sel ? 'checked' : ''} />
            <span>${label}</span>
          </label>`;
      }).join('');
    } else if (q.type === 'open') {
      const L0 = i18n(t.lang);
      body = `<textarea class="quiz-open" placeholder="${L0.typeAnswer}" rows="6">${escapeHtml(userAnswer || '')}</textarea>`;
    }

    const L = i18n(t.lang);
    container.innerHTML = `
      <div class="quiz quiz-runner">
        <div class="quiz-progress">
          <div class="quiz-progress-bar" style="width:${Math.round(((i+1)/total)*100)}%"></div>
          <div class="quiz-progress-meta">
            <span>${L.question} ${i+1} ${L.of} ${total}</span>
            <span class="muted">${badge(q.type, t.lang)}</span>
          </div>
        </div>
        <h2 class="quiz-question">${escapeHtml(q.question)}</h2>
        <div class="quiz-options">${body}</div>
        <div class="quiz-nav">
          <button class="btn-ghost" id="quiz-prev" ${i===0?'disabled':''}>← ${L.previous}</button>
          <button class="btn-ghost" id="quiz-skip">${L.skip}</button>
          ${i === total-1
            ? `<button class="btn-primary" id="quiz-submit">${L.submit}</button>`
            : `<button class="btn-primary" id="quiz-next">${L.next} →</button>`
          }
        </div>
      </div>
    `;

    // wire inputs
    const root = container;
    function captureAnswer() {
      if (q.type === 'mcq') {
        const sel = root.querySelector('input[name="opt"]:checked');
        if (sel) STATE.answers[q.id] = parseInt(sel.value, 10);
      } else if (q.type === 'multi') {
        const checked = [...root.querySelectorAll('input[type="checkbox"]:checked')].map(el => parseInt(el.value, 10));
        STATE.answers[q.id] = checked;
      } else if (q.type === 'truefalse') {
        const sel = root.querySelector('input[name="opt"]:checked');
        if (sel) STATE.answers[q.id] = sel.value === 'true';
      } else if (q.type === 'open') {
        const txt = root.querySelector('.quiz-open');
        if (txt) STATE.answers[q.id] = txt.value;
      }
      saveProgress();
    }

    root.querySelectorAll('input, textarea').forEach(el => {
      el.addEventListener('change', captureAnswer);
      if (el.tagName === 'TEXTAREA') el.addEventListener('blur', captureAnswer);
    });

    root.querySelector('#quiz-prev')?.addEventListener('click', () => { captureAnswer(); STATE.index = Math.max(0, i-1); saveProgress(); renderQuestion(container); });
    root.querySelector('#quiz-skip')?.addEventListener('click', () => { captureAnswer(); STATE.index = Math.min(total-1, i+1); saveProgress(); renderQuestion(container); });
    root.querySelector('#quiz-next')?.addEventListener('click', () => { captureAnswer(); STATE.index = i+1; saveProgress(); renderQuestion(container); });
    root.querySelector('#quiz-submit')?.addEventListener('click', async () => {
      captureAnswer();
      await submit(container);
    });
  }

  // ---------- grading ----------
  function gradeMcq(q, ans)        { return ans === q.answer ? { correct: true, awarded: 1 } : { correct: false, awarded: 0 }; }
  function gradeTruefalse(q, ans)  { return ans === q.answer ? { correct: true, awarded: 1 } : { correct: false, awarded: 0 }; }
  function gradeMulti(q, ans) {
    const expected = new Set(q.answer);
    const got = new Set(Array.isArray(ans) ? ans : []);
    if (expected.size !== got.size) return { correct: false, awarded: partialMulti(expected, got) };
    for (const x of expected) if (!got.has(x)) return { correct: false, awarded: partialMulti(expected, got) };
    return { correct: true, awarded: 1 };
  }
  function partialMulti(expected, got) {
    let hits = 0, wrong = 0;
    for (const x of got) (expected.has(x) ? hits++ : wrong++);
    const score = Math.max(0, (hits - wrong) / expected.size);
    return Math.round(score * 100) / 100;
  }

  // open answers: try AI first, fallback to keyword scoring
  async function gradeOpen(q, ans) {
    if (!ans || !ans.trim()) return { correct: false, awarded: 0, comment: 'No answer provided.' };

    // Try server-side AI grading
    try {
      const res = await fetch('api.php?action=grade-open', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.question, modelAnswer: q.modelAnswer, keyPoints: q.keyPoints || [], userAnswer: ans }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.score === 'number') {
          return { correct: data.score >= 0.7, awarded: Math.max(0, Math.min(1, data.score)), comment: data.comment || '' };
        }
      }
    } catch {}

    // Fallback: simple keyword overlap scoring
    const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const userText = norm(ans);
    const points = (q.keyPoints || []).map(norm);
    if (points.length === 0) return { correct: ans.length > 50, awarded: ans.length > 50 ? 0.5 : 0.2, comment: 'Auto-graded (no key points defined).' };
    let hits = 0;
    for (const p of points) {
      const tokens = p.split(/\s+/).filter(t => t.length > 2);
      const hit = tokens.some(t => userText.includes(t));
      if (hit) hits++;
    }
    const score = Math.round((hits / points.length) * 100) / 100;
    return { correct: score >= 0.7, awarded: score, comment: `Keyword match: ${hits}/${points.length} key points found.` };
  }

  async function submit(container) {
    const L = i18n(STATE.test.lang);
    container.innerHTML = `<div class="quiz quiz-grading"><h2>${L.grading}</h2><p class="muted">${L.gradingHint}</p></div>`;
    STATE.grades = {};
    for (const q of STATE.test.questions) {
      const ans = STATE.answers[q.id];
      let g;
      if      (q.type === 'mcq')        g = gradeMcq(q, ans);
      else if (q.type === 'truefalse')  g = gradeTruefalse(q, ans);
      else if (q.type === 'multi')      g = gradeMulti(q, ans);
      else if (q.type === 'open')       g = await gradeOpen(q, ans);
      else                              g = { correct: false, awarded: 0 };
      STATE.grades[q.id] = g;
    }
    STATE.submitted = true;
    saveProgress();
    renderResults(container);
  }

  // ---------- results ----------
  function renderResults(container) {
    const t = STATE.test;
    const L = i18n(t.lang);
    const total = t.questions.length;
    const totalAwarded = t.questions.reduce((sum, q) => sum + (STATE.grades[q.id]?.awarded || 0), 0);
    const pct = Math.round((totalAwarded / total) * 100);
    const passingRaw = t.passingScore || 0.6;
    const passing = passingRaw <= 1 ? Math.round(passingRaw * 100) : passingRaw;
    const passed = pct >= passing;

    const reviewHtml = t.questions.map((q, idx) => {
      const g = STATE.grades[q.id] || { correct: false, awarded: 0 };
      const ans = STATE.answers[q.id];
      let userView = `<em class="muted">${L.noAnswer}</em>`;
      let correctView = '';

      if (q.type === 'mcq') {
        userView = ans !== undefined ? escapeHtml(q.options[ans]) : userView;
        correctView = `<div class="quiz-correct">${L.correctAnswer}: <strong>${escapeHtml(q.options[q.answer])}</strong></div>`;
      } else if (q.type === 'truefalse') {
        userView = ans !== undefined ? (ans ? L.true : L.false) : userView;
        correctView = `<div class="quiz-correct">${L.correctAnswer}: <strong>${q.answer ? L.true : L.false}</strong></div>`;
      } else if (q.type === 'multi') {
        const arr = Array.isArray(ans) ? ans : [];
        userView = arr.length ? arr.map(i => escapeHtml(q.options[i])).join(', ') : userView;
        correctView = `<div class="quiz-correct">${L.correct}: <strong>${q.answer.map(i => escapeHtml(q.options[i])).join(', ')}</strong></div>`;
      } else if (q.type === 'open') {
        userView = ans ? `<pre class="quiz-open-view">${escapeHtml(ans)}</pre>` : userView;
        correctView = `<details class="quiz-model"><summary>${L.modelAnswer}</summary><div>${escapeHtml(q.modelAnswer || '')}</div></details>`;
      }

      const cls = g.awarded >= 0.7 ? 'ok' : g.awarded > 0 ? 'partial' : 'bad';
      const score = Math.round(g.awarded * 100);
      return `
        <div class="quiz-review-item ${cls}">
          <div class="quiz-review-head">
            <span class="qr-num">Q${idx+1}</span>
            <span class="qr-score">${score}%</span>
            <span class="qr-type">${badge(q.type, t.lang)}</span>
          </div>
          <div class="quiz-review-q">${escapeHtml(q.question)}</div>
          <div class="quiz-review-user"><strong>${L.yourAnswer}:</strong> ${userView}</div>
          ${correctView}
          ${g.comment ? `<div class="quiz-comment"><em>${escapeHtml(g.comment)}</em></div>` : ''}
          ${q.explanation ? `<div class="quiz-explain">💡 ${escapeHtml(q.explanation)}</div>` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="quiz quiz-results">
        <div class="quiz-score-card ${passed ? 'pass' : 'fail'}">
          <div class="quiz-score-pct">${pct}%</div>
          <div class="quiz-score-label">${passed ? '✓ ' + L.passed : '✗ ' + L.failed}</div>
          <div class="muted small">${L.passingScore}: ${passing}% — ${L.awarded} ${totalAwarded.toFixed(1)} / ${total}</div>
        </div>
        <div class="quiz-actions">
          <button class="btn-primary" id="quiz-retake">${L.retake}</button>
          <button class="btn-ghost" id="quiz-export">${L.export}</button>
        </div>
        <h2>${L.review}</h2>
        <div class="quiz-review">${reviewHtml}</div>
      </div>
    `;
    container.querySelector('#quiz-retake')?.addEventListener('click', () => {
      clearProgress(STATE.sectionId);
      STATE.answers = {}; STATE.index = 0; STATE.submitted = false; STATE.grades = {};
      renderIntro(container);
    });
    container.querySelector('#quiz-export')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({
        test: t.title, score: pct, passed, answers: STATE.answers, grades: STATE.grades,
      }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (t.id || 'test') + '-results.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ---------- helpers ----------
  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }
  function badge(type, lang) {
    const map = (lang === 'fr')
      ? { mcq: 'Choix unique', multi: 'Choix multiples', truefalse: 'Vrai / Faux', open: 'Réponse libre' }
      : { mcq: 'Single choice', multi: 'Multiple choice', truefalse: 'True / False', open: 'Open answer' };
    return map[type] || type;
  }
  function i18n(lang) {
    if (lang === 'fr') return {
      questions: 'questions', passingScore: 'Score requis',
      typesLine: 'Types : QCM • Vrai/Faux • Questions ouvertes (corrigées par IA)',
      start: 'Démarrer le test', resume: 'Reprendre le test', restart: 'Recommencer à zéro',
      question: 'Question', of: 'sur', previous: 'Précédent', next: 'Suivant', skip: 'Passer',
      submit: 'Soumettre le test', grading: 'Correction en cours…',
      gradingHint: 'Les questions ouvertes sont évaluées par l’IA.',
      passed: 'Réussi', failed: 'Sous le score requis', awarded: 'Points obtenus',
      retake: 'Refaire le test', export: 'Exporter les résultats (.json)',
      review: 'Correction détaillée', noAnswer: 'Pas de réponse',
      correctAnswer: 'Bonne réponse', correct: 'Bonnes réponses',
      yourAnswer: 'Votre réponse', modelAnswer: 'Réponse modèle',
      true: 'Vrai', false: 'Faux', typeAnswer: 'Saisissez votre réponse…',
    };
    return {
      questions: 'questions', passingScore: 'Passing score',
      typesLine: 'Types: MCQ • True/False • Open answers (AI-graded)',
      start: 'Start test', resume: 'Resume test', restart: 'Restart from scratch',
      question: 'Question', of: 'of', previous: 'Previous', next: 'Next', skip: 'Skip',
      submit: 'Submit test', grading: 'Grading your test…',
      gradingHint: 'Open questions are being evaluated by AI.',
      passed: 'Passed', failed: 'Below passing score', awarded: 'Awarded',
      retake: 'Retake test', export: 'Export results (.json)',
      review: 'Review', noAnswer: 'No answer',
      correctAnswer: 'Correct answer', correct: 'Correct',
      yourAnswer: 'Your answer', modelAnswer: 'Model answer',
      true: 'True', false: 'False', typeAnswer: 'Type your answer…',
    };
  }

  window.Quiz = { open };
})();

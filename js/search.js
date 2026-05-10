// Search index built from all markdown sources.
// Each section is split into "blocks" by H1/H2/H3 headings,
// and ranked using a lightweight TF-style scoring with weighted fields.
(function () {
  const STOPWORDS = new Set(
    'a an the and or of in to is are was were be been being on for with by from as at it its this that these those i you he she we they them us your my our their what which who whom how why when where do does did done can could should would may might must shall will not no yes if then than so such also into about over under more most less few many much any all some'.split(/\s+/)
  );

  const Index = {
    blocks: [], // { sectionId, sectionTitle, group, heading, headingId, anchor, text, terms }
    sectionsMeta: [], // { id, title, group, description }
    ready: false,
  };

  function tokenize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s+#./-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w) && w.length > 1);
  }

  function slugify(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  function splitIntoBlocks(markdown) {
    // Split by headings (#, ##, ###). Keep heading line with its body until next heading.
    const lines = markdown.split(/\r?\n/);
    const blocks = [];
    let current = { level: 0, heading: '', body: [] };
    for (const line of lines) {
      const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
      if (m) {
        if (current.heading || current.body.length) blocks.push(current);
        current = { level: m[1].length, heading: m[2].trim(), body: [] };
      } else {
        current.body.push(line);
      }
    }
    if (current.heading || current.body.length) blocks.push(current);
    return blocks;
  }

  async function build() {
    const cfg = window.APP_CONFIG.sections;
    const all = [
      ...cfg.concepts.map((s) => ({ ...s, group: 'Concepts' })),
      ...cfg.qa.map((s) => ({ ...s, group: 'Q & A' })),
    ];

    Index.sectionsMeta = all.map((s) => ({ id: s.id, title: s.title, group: s.group, description: s.description, type: s.type }));

    for (const sec of all) {
      if (sec.type !== 'md') continue;
      try {
        const md = await window.MD.loadMarkdown(sec.path);
        const blocks = splitIntoBlocks(md);
        for (const b of blocks) {
          const text = (b.heading + '\n' + b.body.join('\n')).trim();
          if (!text) continue;
          const anchor = b.heading ? slugify(b.heading) : '';
          Index.blocks.push({
            sectionId: sec.id,
            sectionTitle: sec.title,
            group: sec.group,
            heading: b.heading || sec.title,
            anchor,
            text,
            headingTerms: tokenize(b.heading || sec.title),
            bodyTerms: tokenize(b.body.join(' ')),
            sectionTerms: tokenize(sec.title),
          });
        }
      } catch (e) {
        console.warn('Index build failed for', sec.path, e);
      }
    }
    Index.ready = true;
  }

  function score(query) {
    const q = tokenize(query);
    if (!q.length) return [];
    const results = [];
    const phrase = query.toLowerCase().trim();

    for (const b of Index.blocks) {
      let s = 0;
      const matchedTerms = new Set(); // unique query terms that hit somewhere
      const headingLower = (b.heading || '').toLowerCase();
      const sectionLower = (b.sectionTitle || '').toLowerCase();
      const textLower = b.text.toLowerCase();

      for (const term of q) {
        let termMatched = false;

        // Heading: exact word match (strongest signal)
        const headingExact = b.headingTerms.filter((t) => t === term).length;
        if (headingExact) { s += 14 * Math.min(headingExact, 3); termMatched = true; }
        // Heading: partial word match
        const headingPartial = b.headingTerms.filter((t) => t !== term && (t.includes(term) || term.includes(t))).length;
        if (headingPartial) { s += 4 * Math.min(headingPartial, 3); termMatched = true; }

        // Section title
        const sectionExact = b.sectionTerms.filter((t) => t === term).length;
        if (sectionExact) { s += 3; termMatched = true; }
        else if (sectionLower.includes(term)) { s += 1.5; termMatched = true; }

        // Body: exact word match (capped, low weight)
        const bodyExact = b.bodyTerms.filter((t) => t === term).length;
        if (bodyExact) { s += 0.6 * Math.min(bodyExact, 8); termMatched = true; }
        // Body: partial match (very low weight)
        const bodyPartial = b.bodyTerms.filter((t) => t !== term && t.includes(term)).length;
        if (bodyPartial) { s += 0.15 * Math.min(bodyPartial, 5); }

        if (termMatched) matchedTerms.add(term);
      }

      // Strong bonus when EVERY query term was found somewhere
      if (matchedTerms.size === q.length) s += 25;
      // Heavy bonus when every query term appears in the heading itself
      const allInHeading = q.every((t) => b.headingTerms.some((ht) => ht === t || ht.includes(t)));
      if (q.length > 1 && allInHeading) s += 40;
      // Exact phrase bonus
      if (q.length > 1 && phrase.length > 3) {
        if (headingLower.includes(phrase)) s += 50;
        else if (textLower.includes(phrase)) s += 15;
      }
      // Penalty: only some query terms matched
      if (matchedTerms.size < q.length) s *= 0.45;

      if (matchedTerms.size > 0 && s > 0) results.push({ block: b, score: s });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 30);
  }

  function snippet(text, query, maxLen = 140) {
    const q = tokenize(query);
    if (!q.length) return text.slice(0, maxLen);
    const lower = text.toLowerCase();
    let pos = -1;
    for (const t of q) {
      const i = lower.indexOf(t);
      if (i !== -1 && (pos === -1 || i < pos)) pos = i;
    }
    if (pos === -1) pos = 0;
    const start = Math.max(0, pos - 40);
    let snip = text.slice(start, start + maxLen);
    if (start > 0) snip = '…' + snip;
    if (start + maxLen < text.length) snip += '…';
    // Strip markdown noise
    return snip.replace(/[#*`_>~]/g, '').replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  }

  function highlight(text, query) {
    const q = tokenize(query).sort((a, b) => b.length - a.length);
    let out = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    for (const t of q) {
      const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  window.SearchIndex = { build, score, snippet, highlight, get blocks() { return Index.blocks; }, get ready() { return Index.ready; } };
})();

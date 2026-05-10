// Markdown loading + rendering with proper image base path resolution.
(function () {
  // Configure marked with syntax highlighting
  // marked v12+: use marked.use() instead of marked.setOptions()
  // marked-highlight UMD exports the function directly as window.markedHighlight
  try {
    if (typeof marked !== 'undefined') {
      if (window.hljs) {
        // The UMD export of marked-highlight is the function itself
        const hlExtension = window.markedHighlight
          ? (typeof window.markedHighlight === 'function'
              ? window.markedHighlight
              : window.markedHighlight.markedHighlight)
          : null;
        if (hlExtension) {
          marked.use(
            hlExtension({
              langPrefix: 'hljs language-',
              highlight(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                try { return hljs.highlight(code, { language }).value; } catch { return code; }
              },
            })
          );
        }
      }
      // gfm is on by default in marked v12; breaks:false is also default
      if (typeof marked.use === 'function') {
        marked.use({ gfm: true, breaks: false });
      } else if (typeof marked.setOptions === 'function') {
        marked.setOptions({ gfm: true, breaks: false });
      }
    }
  } catch (e) {
    console.warn('marked setup error (non-fatal):', e);
  }

  const mdCache = new Map();

  async function loadMarkdown(path) {
    if (mdCache.has(path)) return mdCache.get(path);
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load ' + path + ' (' + res.status + ')');
    const text = await res.text();
    mdCache.set(path, text);
    return text;
  }

  function slugify(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  function renderMarkdown(text, basePath) {
    // Guard: if marked CDN failed to load, fall back to pre-escaped plain text
    let html;
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      html = marked.parse(text);
    } else {
      html = '<pre>' + text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>';
    }
    if (basePath) {
      // Rewrite relative image src and links so they resolve against basePath
      html = html.replace(/\b(src|href)="(?!https?:|data:|#|\/)([^"]+)"/g, (_, attr, url) => {
        return `${attr}="${basePath}${url}"`;
      });
    }

    // Post-process the rendered HTML in a sandbox div:
    // 1) inject IDs onto headings
    // 2) rewrite Notion links to in-page anchors when the link text matches a heading
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    const headingMap = new Map(); // slug -> id
    tmp.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
      const slug = slugify(h.textContent);
      if (slug) {
        if (!h.id) h.id = slug;
        headingMap.set(slug, h.id);
      }
    });

    tmp.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const isNotion = /^https?:\/\/(www\.)?notion\.so\//i.test(href);
      if (!isNotion) return;
      const slug = slugify(a.textContent);
      const target = headingMap.get(slug);
      if (target) {
        a.setAttribute('href', '#' + target);
        a.removeAttribute('target');
      } else {
        // Notion link with no matching local heading: kill the navigation
        a.setAttribute('href', '#');
        a.classList.add('dead-link');
        a.title = 'External Notion link removed';
      }
    });

    // Convert plain-text "sommaire" list items into in-page anchors when their
    // text matches a heading in the document. Handles items like:
    //   "#1🧩 1. Spring Boot Setup : Initialisation…"
    // by stripping a leading "#<number>" reference token before slug matching.
    tmp.querySelectorAll('li').forEach((li) => {
      // Skip items that already contain a link or nested block-level content
      if (li.querySelector('a, ul, ol, pre, blockquote')) return;
      const raw = (li.textContent || '').trim();
      if (!raw) return;

      const candidates = [
        raw,
        raw.replace(/^#\s*\d+\S*\s*/, ''), // strip "#1🧩 " style prefix
        raw.replace(/^[#\d.\-\s]+/, ''),    // strip generic numeric/punct prefix
      ];

      let targetId = null;
      for (const c of candidates) {
        const slug = slugify(c);
        if (slug && headingMap.has(slug)) { targetId = headingMap.get(slug); break; }
      }
      // Fallback: try matching by checking if any heading slug is contained
      // within the item slug (handles trailing punctuation / extra words).
      if (!targetId) {
        const itemSlug = slugify(raw);
        if (itemSlug.length > 6) {
          for (const [hSlug, id] of headingMap) {
            if (hSlug.length > 6 && (itemSlug.endsWith(hSlug) || itemSlug.includes(hSlug))) {
              targetId = id;
              break;
            }
          }
        }
      }

      if (targetId) {
        const a = document.createElement('a');
        a.href = '#' + targetId;
        while (li.firstChild) a.appendChild(li.firstChild);
        li.appendChild(a);
        li.classList.add('toc-item');
      }
    });

    return tmp.innerHTML;
  }

  window.MD = { loadMarkdown, renderMarkdown, slugify };
})();

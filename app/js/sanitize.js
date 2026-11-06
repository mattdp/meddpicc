/*
 * MEDDPICC Editor: allowlist HTML sanitizer and URL normalizer.
 *
 * Output contains only: p, br, strong, em, u, a[href], ul, ol, li.
 * Runs on paste, on load from file, on restore from browser storage, and
 * before every save. Untrusted HTML is parsed with DOMParser (an inert
 * document: no scripts run, no images load) and never assigned to a live
 * element. A clean tree is rebuilt from text nodes and allowlisted tags.
 */
(function (M) {
  'use strict';

  // Removed together with everything inside them.
  var DROP = toSet('script style iframe frame frameset object embed applet noscript template ' +
    'head title meta link base svg math img picture video audio source track canvas map area ' +
    'input select option optgroup textarea button param');

  // Block-level elements other than lists: their content becomes paragraphs.
  var BLOCK = toSet('address article aside blockquote center dd details dialog div dl dt ' +
    'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main nav p pre ' +
    'section summary table caption thead tbody tfoot tr td th');

  var MERGEABLE = toSet('STRONG EM U A');
  var ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];
  var NO_MARKS = Object.freeze({ strong: false, em: false, u: false, href: null });

  function toSet(words) {
    var set = Object.create(null);
    words.split(/\s+/).forEach(function (w) { if (w) set[w] = true; });
    return set;
  }

  /*
   * Returns a safe, absolute href for http, https, or mailto, or null.
   * "example.com" becomes "https://example.com/", "jane@example.com" becomes
   * "mailto:jane@example.com". Anything else (javascript:, data:, relative
   * paths, plain words) is rejected.
   */
  function normalizeUrl(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s) return null;
    if (/[\u0000-\u001F\u007F]/.test(s)) return null; // control characters hide schemes

    var candidate;
    var scheme = /^([a-zA-Z][a-zA-Z0-9+.\-]*):([\s\S]*)$/.exec(s);
    if (scheme && !/^\d/.test(scheme[2])) {
      candidate = s; // explicit scheme; checked against the allowlist below
    } else if (/^\/\//.test(s)) {
      candidate = 'https:' + s;
    } else {
      if (/\s/.test(s)) return null;
      if (/^[^@\/?#:]+@[^@\/?#:]+\.[^@\/?#:]+$/.test(s)) {
        candidate = 'mailto:' + s;
      } else if (/^(localhost|[^\/?#:@]+\.[^\/?#:@.]+)(:\d+)?([\/?#][\s\S]*)?$/i.test(s)) {
        candidate = 'https://' + s;
      } else {
        return null;
      }
    }

    var url;
    try { url = new URL(candidate); } catch (e) { return null; }
    if (ALLOWED_PROTOCOLS.indexOf(url.protocol) === -1) return null;
    if (url.protocol !== 'mailto:' && !url.hostname) return null;
    if (url.protocol === 'mailto:' && !url.pathname && !url.search) return null;
    return url.href;
  }

  function el(tag) { return document.createElement(tag); }

  // Inline formatting implied by a tag and its style attribute. Styles are
  // only read (Google Docs and Word express bold/italic this way), never kept.
  function marksFor(node, tag, marks) {
    var m = { strong: marks.strong, em: marks.em, u: marks.u, href: marks.href };
    if (tag === 'b' || tag === 'strong') m.strong = true;
    if (tag === 'i' || tag === 'em') m.em = true;
    if (tag === 'u') m.u = true;

    var style = node.getAttribute('style');
    if (style) {
      style = style.toLowerCase();
      var fw = /(?:^|;)\s*font-weight\s*:\s*([^;!]+)/.exec(style);
      if (fw) {
        var w = fw[1].trim();
        var n = parseInt(w, 10);
        if (w === 'bold' || w === 'bolder' || (!isNaN(n) && n >= 600)) m.strong = true;
        else if (w === 'normal' || w === 'lighter' || (!isNaN(n) && n < 600)) m.strong = false;
      }
      var fs = /(?:^|;)\s*font-style\s*:\s*([^;!]+)/.exec(style);
      if (fs) {
        var f = fs[1].trim();
        if (f === 'italic' || f.indexOf('oblique') === 0) m.em = true;
        else if (f === 'normal') m.em = false;
      }
      var td = /(?:^|;)\s*text-decoration(?:-line)?\s*:\s*([^;!]+)/.exec(style);
      if (td) {
        if (/underline/.test(td[1])) m.u = true;
        else if (/none/.test(td[1])) m.u = false;
      }
    }
    return m;
  }

  // Wraps a node in canonical order: a > strong > em > u > node.
  function wrap(node, marks) {
    var cur = node;
    if (marks.u) { var u = el('u'); u.appendChild(cur); cur = u; }
    if (marks.em) { var em = el('em'); em.appendChild(cur); cur = em; }
    if (marks.strong) { var b = el('strong'); b.appendChild(cur); cur = b; }
    if (marks.href) { var a = el('a'); a.setAttribute('href', marks.href); a.appendChild(cur); cur = a; }
    return cur;
  }

  function isBreakish(node) {
    return !!node && (node.nodeName === 'BR' || node.nodeName === 'UL' || node.nodeName === 'OL');
  }

  function lastLi(list) {
    for (var n = list.lastChild; n; n = n.previousSibling) {
      if (n.nodeName === 'LI') return n;
    }
    return null;
  }

  /*
   * ctx.kind:
   *   'root' - top level; inline content is gathered into <p>
   *   'list' - inside ul/ol; inline content is gathered into <li>
   *   'li'   - inside li; inline content goes directly in, nested blocks
   *            become line breaks, nested lists are kept
   */
  function inlineTarget(ctx) {
    if (ctx.kind === 'root' || ctx.kind === 'list') {
      if (!ctx.pending) {
        ctx.pending = el(ctx.kind === 'root' ? 'p' : 'li');
        ctx.out.appendChild(ctx.pending);
      }
      return ctx.pending;
    }
    if (ctx.needBreak) {
      if (ctx.out.lastChild && !isBreakish(ctx.out.lastChild)) ctx.out.appendChild(el('br'));
      ctx.needBreak = false;
    }
    return ctx.out;
  }

  function walkBlock(node, ctx, marks) {
    if (ctx.kind === 'li') {
      if (ctx.out.lastChild) ctx.needBreak = true;
      walk(node, ctx, marks);
      ctx.needBreak = true;
    } else {
      ctx.pending = null;
      walk(node, ctx, marks);
      ctx.pending = null;
    }
  }

  function walk(src, ctx, marks) {
    for (var node = src.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) {
        var text = node.nodeValue;
        if (!text) continue;
        // Formatting whitespace between blocks is not content.
        if ((ctx.kind === 'root' || ctx.kind === 'list') && !ctx.pending && /^[ \t\n\r\f]*$/.test(text)) continue;
        inlineTarget(ctx).appendChild(wrap(document.createTextNode(text), marks));
        continue;
      }
      if (node.nodeType !== 1) continue; // comments, processing instructions

      var tag = node.localName;
      if (DROP[tag]) continue;
      var childMarks = marksFor(node, tag, marks);

      if (tag === 'br') {
        inlineTarget(ctx).appendChild(el('br'));
      } else if (tag === 'ul' || tag === 'ol') {
        var list = el(tag);
        if (ctx.kind === 'root') {
          ctx.pending = null;
          ctx.out.appendChild(list);
        } else if (ctx.kind === 'list') {
          // A list directly inside a list (browsers produce this when
          // indenting) belongs to the preceding item.
          var host = ctx.pending || lastLi(ctx.out);
          if (!host) { host = el('li'); ctx.out.appendChild(host); }
          host.appendChild(list);
          ctx.pending = null;
        } else {
          ctx.out.appendChild(list);
          ctx.needBreak = false;
        }
        walk(node, { kind: 'list', out: list, pending: null, needBreak: false }, childMarks);
      } else if (tag === 'li' && ctx.kind === 'list') {
        ctx.pending = null;
        var li = el('li');
        ctx.out.appendChild(li);
        walk(node, { kind: 'li', out: li, pending: null, needBreak: false }, childMarks);
      } else if (BLOCK[tag] || tag === 'li') {
        walkBlock(node, ctx, childMarks);
      } else if (tag === 'a') {
        var linkMarks = childMarks;
        if (!marks.href) {
          var href = normalizeUrl(node.getAttribute('href') || '');
          if (href) linkMarks = { strong: childMarks.strong, em: childMarks.em, u: childMarks.u, href: href };
        }
        walk(node, ctx, linkMarks);
      } else {
        // Any other element (span, font, code, etc.) is transparent.
        walk(node, ctx, childMarks);
      }
    }
  }

  function sameMergeable(a, b) {
    return a.nodeType === 1 && b.nodeType === 1 && a.nodeName === b.nodeName && MERGEABLE[a.nodeName] &&
      (a.nodeName !== 'A' || a.getAttribute('href') === b.getAttribute('href'));
  }

  // <strong>a</strong><strong>b</strong> becomes <strong>ab</strong>.
  function mergeAdjacent(parent) {
    var child = parent.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (next && sameMergeable(child, next)) {
        while (next.firstChild) child.appendChild(next.firstChild);
        parent.removeChild(next);
        continue;
      }
      child = next;
    }
    for (var c = parent.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) mergeAdjacent(c);
    }
  }

  function pruneEmpty(parent) {
    var child = parent.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 1) {
        pruneEmpty(child);
        var name = child.nodeName;
        var empty = !child.firstChild ||
          ((name === 'UL' || name === 'OL') && !child.querySelector('li'));
        if (empty && name !== 'BR') parent.removeChild(child);
      }
      child = next;
    }
  }

  function sanitizeHtml(html) {
    if (typeof html !== 'string' || html === '') return '';
    var parsed = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><head></head><body>' + html + '</body></html>', 'text/html');
    var out = el('div');
    walk(parsed.body, { kind: 'root', out: out, pending: null, needBreak: false }, NO_MARKS);
    mergeAdjacent(out);
    pruneEmpty(out);
    out.normalize();
    if (!/\S/.test(out.textContent)) return '';
    return out.innerHTML;
  }

  M.sanitizeHtml = sanitizeHtml;
  M.normalizeUrl = normalizeUrl;
})(window.Meddpicc = window.Meddpicc || {});

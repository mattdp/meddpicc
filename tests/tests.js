/*
 * Dependency-free unit tests. Open tests/tests.html in a browser.
 * The page title becomes "PASS n/n" or "FAIL x/n" for headless runs.
 */
(function (M) {
  'use strict';

  var results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, error: e && e.message ? e.message : String(e) });
    }
  }

  function eq(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message ? message + '\n' : '') +
        'expected: ' + JSON.stringify(expected) + '\n  actual: ' + JSON.stringify(actual));
    }
  }

  function ok(condition, message) {
    if (!condition) throw new Error(message || 'expected condition to be true');
  }

  function notContains(haystack, needle) {
    if (String(haystack).toLowerCase().indexOf(needle.toLowerCase()) !== -1) {
      throw new Error('expected output not to contain ' + JSON.stringify(needle) + '\n  output: ' + JSON.stringify(haystack));
    }
  }

  var S = M.sanitizeHtml;

  // ---------------- config ----------------

  test('config: eight sections in priority display order', function () {
    eq(M.SECTIONS.map(function (s) { return s.key; }).join(','),
      'metrics,economic_buyer,champion,identify_pain,decision_criteria,decision_process,paper_process,competition');
  });

  test('config: first four sections are the priority group', function () {
    eq(M.SECTIONS.slice(0, 4).every(function (s) { return s.group === 'priority'; }), true);
    eq(M.SECTIONS.slice(4).every(function (s) { return s.group === 'secondary'; }), true);
  });

  test('config: exactly six statuses in picker order, white is default with no label', function () {
    eq(M.STATUSES.map(function (s) { return s.value; }).join(','), 'white,red,yellow,green,blue,gray');
    eq(M.DEFAULT_STATUS, 'white');
    eq(M.statusByValue('white').label, '');
  });

  test('config: status labels', function () {
    eq(M.statusByValue('red').label, 'Risky and presently important');
    eq(M.statusByValue('yellow').label, 'Risky, not presently as important');
    eq(M.statusByValue('green').label, 'Excellent');
    eq(M.statusByValue('blue').label, 'Okay');
    eq(M.statusByValue('gray').label, 'Presently irrelevant');
  });

  // ---------------- sanitizer: allowlist ----------------

  test('sanitize: keeps allowlisted formatting', function () {
    var html = '<p><strong>b</strong> <em>i</em> <u>u</u> <a href="https://example.com/">l</a></p>' +
      '<ul><li>one</li></ul><ol><li>two</li></ol>';
    eq(S(html), html);
  });

  test('sanitize: empty and whitespace-only become empty string', function () {
    eq(S(''), '');
    eq(S('<p><br></p>'), '');
    eq(S('<p>   </p><ul><li><br></li></ul>'), '');
    eq(S(null), '');
  });

  test('sanitize: b and i normalize to strong and em', function () {
    eq(S('<p><b>x</b><i>y</i></p>'), '<p><strong>x</strong><em>y</em></p>');
  });

  test('sanitize: div becomes p', function () {
    eq(S('<div>a</div><div><br></div><div>b</div>'), '<p>a</p><p><br></p><p>b</p>');
  });

  test('sanitize: bare top-level text is wrapped in a paragraph', function () {
    eq(S('hello <b>world</b><br>next'), '<p>hello <strong>world</strong><br>next</p>');
  });

  test('sanitize: disallowed inline tags are unwrapped, text kept', function () {
    eq(S('<p><span>a</span><font color="red">b</font><code>c</code><s>d</s></p>'), '<p>abcd</p>');
  });

  test('sanitize: headings become paragraphs', function () {
    eq(S('<h1>Title</h1><p>body</p>'), '<p>Title</p><p>body</p>');
  });

  test('sanitize: all attributes dropped except href', function () {
    eq(S('<p class="x" id="y" style="color:red" data-a="1"><a href="https://example.com/" class="c" target="_blank" rel="x" title="t">a</a></p>'),
      '<p><a href="https://example.com/">a</a></p>');
  });

  test('sanitize: nested identical marks collapse', function () {
    eq(S('<p><b><strong>x</strong></b></p>'), '<p><strong>x</strong></p>');
  });

  test('sanitize: adjacent same marks merge', function () {
    eq(S('<p><strong>a</strong><strong>b</strong></p>'), '<p><strong>ab</strong></p>');
  });

  test('sanitize: mixed nesting keeps structure', function () {
    eq(S('<p><strong>a <em>b</em> c</strong></p>'), '<p><strong>a <em>b</em> c</strong></p>');
  });

  test('sanitize: link inside bold', function () {
    eq(S('<p><b><a href="https://example.com">t</a></b></p>'), '<p><a href="https://example.com/"><strong>t</strong></a></p>');
  });

  test('sanitize: nested lists are kept', function () {
    var html = '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>';
    eq(S(html), html);
  });

  test('sanitize: list directly inside list attaches to previous item', function () {
    eq(S('<ul><li>a</li><ul><li>b</li></ul></ul>'), '<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  test('sanitize: paragraphs inside list items become line breaks', function () {
    eq(S('<ul><li><p>a</p><p>b</p></li></ul>'), '<ul><li>a<br>b</li></ul>');
  });

  test('sanitize: tables flatten to paragraphs', function () {
    eq(S('<table><tr><td>a</td><td>b</td></tr></table>'), '<p>a</p><p>b</p>');
  });

  test('sanitize: is idempotent', function () {
    var inputs = [
      '<p><strong>a <em>b</em> c</strong></p><ul><li>x<ul><li>y</li></ul></li></ul>',
      'raw <i>text</i><div>block</div><ol><li><p>p1</p><p>p2</p></li></ol>',
      '<p><a href="example.com"><b>bold link</b></a> and <u>under</u></p>',
      '<b style="font-weight:normal"><p><span style="font-weight:700">x</span></p></b>'
    ];
    inputs.forEach(function (input) {
      var once = S(input);
      eq(S(once), once, 'input: ' + input);
    });
  });

  // ---------------- sanitizer: paste sources ----------------

  test('sanitize: Google Docs wrapper and style-based bold/italic/underline', function () {
    var gdocs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc">' +
      '<p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span style="font-size:11pt;font-family:Arial;font-weight:700;">Bold</span>' +
      '<span style="font-size:11pt;font-weight:400;"> plain </span>' +
      '<span style="font-style:italic;font-weight:400;">ital</span>' +
      '<span style="text-decoration:underline;font-weight:400;">und</span></p></b>';
    eq(S(gdocs), '<p><strong>Bold</strong> plain <em>ital</em><u>und</u></p>');
  });

  test('sanitize: Word-style markup loses styles and comments', function () {
    var word = '<html><head><style>p.MsoNormal{color:red}</style></head><body><!--StartFragment-->' +
      '<p class="MsoNormal" style="margin:0in"><b><span style="font-size:12pt;color:#ff0000">Hi</span></b>' +
      '<o:p></o:p></p><!--EndFragment--></body></html>';
    eq(S(word), '<p><strong>Hi</strong></p>');
  });

  // ---------------- sanitizer: security ----------------

  test('sanitize: script and style removed with their content', function () {
    var out = S('<p>a<script>alert(1)</script>b</p><style>p{color:red}</style>');
    eq(out, '<p>ab</p>');
  });

  test('sanitize: event handler attributes removed', function () {
    var out = S('<p onclick="alert(1)">x<img src=x onerror="window.__pwned=1"><b onmouseover="alert(1)">y</b></p>');
    eq(out, '<p>x<strong>y</strong></p>');
  });

  test('sanitize: javascript: and other unsafe hrefs removed, text kept', function () {
    var cases = [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', 'java\tscript:alert(1)',
      'java&#x09;script:alert(1)', '&#106;avascript:alert(1)', 'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '/relative/path', '#anchor'
    ];
    cases.forEach(function (href) {
      var out = S('<p><a href="' + href + '">click</a></p>');
      eq(out, '<p>click</p>', 'href: ' + href);
    });
  });

  test('sanitize: dangerous containers removed entirely', function () {
    var out = S('<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">' +
      '<svg><script>alert(1)</script><text>svgtext</text></svg><math><mi>x</mi></math>' +
      '<template><p>tpl</p></template><noscript>ns</noscript><textarea>ta</textarea><p>ok</p>');
    eq(out, '<p>ok</p>');
  });

  test('sanitize: form controls and media dropped', function () {
    eq(S('<p>a<input value="v"><button>btn</button><select><option>o</option></select><video src="x"></video>b</p>'), '<p>ab</p>');
  });

  test('sanitize: escapes text so markup in text stays text', function () {
    var out = S('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    eq(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  test('sanitize: href with quotes cannot break out of the attribute', function () {
    var out = S('<a href=\'https://example.com/"onmouseover="alert(1)\'>t</a>');
    notContains(out, 'onmouseover="');
    ok(/^<p><a href="https:\/\/example\.com\/[^"]*">t<\/a><\/p>$/.test(out), out);
  });

  // ---------------- URL normalization ----------------

  test('normalizeUrl: allowed schemes and bare inputs', function () {
    eq(M.normalizeUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
    eq(M.normalizeUrl('http://example.com'), 'http://example.com/');
    eq(M.normalizeUrl('example.com'), 'https://example.com/');
    eq(M.normalizeUrl('www.example.com/path'), 'https://www.example.com/path');
    eq(M.normalizeUrl('example.com:8080/x'), 'https://example.com:8080/x');
    eq(M.normalizeUrl('localhost:3000'), 'https://localhost:3000/');
    eq(M.normalizeUrl('//example.com'), 'https://example.com/');
    eq(M.normalizeUrl('mailto:jane@example.com'), 'mailto:jane@example.com');
    eq(M.normalizeUrl('jane@example.com'), 'mailto:jane@example.com');
    eq(M.normalizeUrl('  https://example.com  '), 'https://example.com/');
  });

  test('normalizeUrl: rejects unsafe or non-URL input', function () {
    ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', 'java\nscript:x',
      'data:text/html,x', 'vbscript:x', 'file:///x', 'ftp://example.com', 'hello', 'hello world',
      '', '   ', '/path', '#frag', 'https://', 'mailto:', null, undefined, 42
    ].forEach(function (input) {
      eq(M.normalizeUrl(input), null, 'input: ' + JSON.stringify(input));
    });
  });

  // ---------------- document model ----------------

  function fullDoc() {
    var doc = M.createEmptyDocument();
    doc.title = 'Acme Corp - Q1 Renewal';
    doc.updated_at = '2026-11-06T15:30:00Z';
    doc.next_steps.content = '<ul><li>Schedule CFO meeting</li></ul>';
    doc.sections.metrics = { status: 'green', content: '<p>Reduce churn by <strong>15%</strong></p>' };
    doc.sections.economic_buyer = { status: 'yellow', content: '<p>CFO, <a href="https://example.com/jane">Jane</a></p>' };
    doc.sections.champion.status = 'blue';
    doc.sections.identify_pain = { status: 'red', content: '<p><em>Security</em> review</p>' };
    doc.sections.paper_process.status = 'gray';
    return doc;
  }

  test('document: empty document shape', function () {
    var doc = M.createEmptyDocument();
    eq(doc.format, 'meddpicc-editor');
    eq(doc.version, 1);
    eq(doc.title, '');
    eq(doc.next_steps.content, '');
    eq(Object.keys(doc.sections).length, 8);
    M.SECTIONS.forEach(function (s) {
      eq(doc.sections[s.key].status, 'white');
      eq(doc.sections[s.key].content, '');
    });
  });

  test('document: serialize then parse is lossless', function () {
    var doc = fullDoc();
    var text = M.serializeDocument(doc);
    var parsed = M.parseDocumentText(text);
    eq(parsed.ok, true);
    eq(parsed.warnings.length, 0);
    eq(JSON.stringify(parsed.doc), JSON.stringify(doc));
    eq(M.serializeDocument(parsed.doc), text);
  });

  test('document: serialized key order and formatting', function () {
    var text = M.serializeDocument(fullDoc());
    var data = JSON.parse(text);
    eq(Object.keys(data).join(','), 'format,version,title,updated_at,next_steps,sections');
    eq(Object.keys(data.sections).join(','), M.SECTIONS.map(function (s) { return s.key; }).join(','));
    ok(text.indexOf('\n  "format"') !== -1, 'uses 2-space indent');
    ok(text.slice(-1) === '\n', 'ends with newline');
  });

  test('document: missing fields fall back to defaults without failing', function () {
    var r = M.parseDocumentText(JSON.stringify({
      format: 'meddpicc-editor', version: 1,
      sections: { metrics: { status: 'red' }, champion: { content: '<p>Sam</p>' }, competition: 'nonsense' }
    }));
    eq(r.ok, true);
    eq(r.warnings.length, 0);
    eq(r.doc.title, '');
    eq(r.doc.updated_at, null);
    eq(r.doc.next_steps.content, '');
    eq(r.doc.sections.metrics.status, 'red');
    eq(r.doc.sections.metrics.content, '');
    eq(r.doc.sections.champion.status, 'white');
    eq(r.doc.sections.champion.content, '<p>Sam</p>');
    eq(r.doc.sections.competition.status, 'white');
    eq(r.doc.sections.economic_buyer.status, 'white');
  });

  test('document: unknown status resets to white with a warning', function () {
    var r = M.parseDocumentText(JSON.stringify({
      format: 'meddpicc-editor', version: 1, sections: { metrics: { status: 'purple', content: '' } }
    }));
    eq(r.ok, true);
    eq(r.doc.sections.metrics.status, 'white');
    eq(r.warnings.length, 1);
    ok(/purple/.test(r.warnings[0]) && /Metrics/.test(r.warnings[0]), r.warnings[0]);
  });

  test('document: unknown extra keys are ignored and not kept', function () {
    var r = M.parseDocumentText(JSON.stringify({
      format: 'meddpicc-editor', version: 1, extra: 1,
      sections: { metrics: { status: 'red', content: '', owner: 'x' }, made_up: { status: 'red' } }
    }));
    eq(r.ok, true);
    var out = JSON.parse(M.serializeDocument(r.doc));
    eq('extra' in out, false);
    eq('made_up' in out.sections, false);
    eq('owner' in out.sections.metrics, false);
  });

  test('document: invalid JSON is an error', function () {
    var r = M.parseDocumentText('{ not json');
    eq(r.ok, false);
    ok(/valid JSON/.test(r.error), r.error);
  });

  test('document: wrong format is an error', function () {
    eq(M.parseDocumentText('{"format":"something-else","version":1}').ok, false);
    eq(M.parseDocumentText('[]').ok, false);
    eq(M.parseDocumentText('null').ok, false);
    eq(M.parseDocumentText('"text"').ok, false);
  });

  test('document: missing or invalid version is an error', function () {
    eq(M.parseDocumentText('{"format":"meddpicc-editor"}').ok, false);
    eq(M.parseDocumentText('{"format":"meddpicc-editor","version":"1"}').ok, false);
    eq(M.parseDocumentText('{"format":"meddpicc-editor","version":0}').ok, false);
    eq(M.parseDocumentText('{"format":"meddpicc-editor","version":1.5}').ok, false);
  });

  test('document: newer version loads with a warning', function () {
    var r = M.parseDocumentText('{"format":"meddpicc-editor","version":2,"title":"T"}');
    eq(r.ok, true);
    eq(r.doc.title, 'T');
    eq(r.warnings.length, 1);
    ok(/newer version/.test(r.warnings[0]), r.warnings[0]);
  });

  test('document: title is forced to a single line', function () {
    var r = M.parseDocumentText('{"format":"meddpicc-editor","version":1,"title":"a\\nb\\tc"}');
    eq(r.doc.title, 'a b c');
  });

  test('document: malicious file content is sanitized on load', function () {
    var evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>' +
      '<a href="javascript:window.__pwned=1">x</a><p onclick="window.__pwned=1">y</p>';
    var r = M.parseDocumentText(JSON.stringify({
      format: 'meddpicc-editor', version: 1, next_steps: { content: evil },
      sections: { metrics: { status: 'red', content: evil } }
    }));
    eq(r.ok, true);
    [r.doc.next_steps.content, r.doc.sections.metrics.content].forEach(function (c) {
      notContains(c, '<script');
      notContains(c, '<img');
      notContains(c, 'onerror');
      notContains(c, 'onclick');
      notContains(c, 'javascript:');
      eq(c, '<p>x</p><p>y</p>');
    });
  });

  // ---------------- filenames ----------------

  test('filename: derived from title', function () {
    eq(M.filenameFromTitle('Acme Corp - Q1 Renewal'), 'Acme-Corp-Q1-Renewal.json');
    eq(M.filenameFromTitle('  Big   Deal  '), 'Big-Deal.json');
    eq(M.filenameFromTitle('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij.json');
    eq(M.filenameFromTitle(''), 'meddpicc.json');
    eq(M.filenameFromTitle('   '), 'meddpicc.json');
    eq(M.filenameFromTitle('///'), 'meddpicc.json');
    eq(M.filenameFromTitle('...hidden'), 'hidden.json');
    eq(M.filenameFromTitle(new Array(300).join('x')).length, 100 + '.json'.length);
  });

  test('isoNow: UTC without milliseconds', function () {
    eq(M.isoNow(new Date(Date.UTC(2026, 10, 6, 15, 30, 0, 123))), '2026-11-06T15:30:00Z');
  });

  // ---------------- report ----------------

  function report() {
    var failed = results.filter(function (r) { return !r.ok; });
    var list = document.getElementById('results');
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'bad';
      li.textContent = r.name;
      if (!r.ok) {
        var pre = document.createElement('pre');
        pre.textContent = r.error;
        li.appendChild(pre);
      }
      list.appendChild(li);
    });
    var summary = document.getElementById('summary');
    var total = results.length;
    summary.textContent = failed.length ? failed.length + ' of ' + total + ' tests failed' : 'All ' + total + ' tests passed';
    summary.className = failed.length ? 'fail' : 'pass';
    summary.dataset.passed = String(total - failed.length);
    summary.dataset.failed = String(failed.length);
    document.title = (failed.length ? 'FAIL ' + failed.length : 'PASS ' + total) + '/' + total;
  }

  // Async check: nothing above may have executed injected script.
  setTimeout(function () {
    test('security: no injected handler ever ran', function () {
      eq(window.__pwned, undefined);
    });
    report();
  }, 300);
})(window.Meddpicc);

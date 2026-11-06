/*
 * MEDDPICC Editor: rich text editing.
 * contenteditable regions, one shared formatting toolbar, the link popover,
 * clean paste and drop, and Cmd/Ctrl+click to open links.
 */
(function (M) {
  'use strict';

  var IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  var MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

  var editors = [];
  var onChange = function () {};
  var toolbar = null;
  var lastEditor = null;   // editor the toolbar acts on when focus is elsewhere
  var lastRange = null;    // last selection inside lastEditor
  var internalDrag = false;
  var pop = { el: null, input: null, error: null, removeBtn: null, state: null };

  // ---------- helpers ----------

  function exec(command, value) {
    try {
      return document.execCommand(command, false, value === undefined ? null : value);
    } catch (e) {
      return false;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function editorFor(node) {
    for (var n = node; n; n = n.parentNode) {
      if (n.nodeType === 1 && editors.indexOf(n) !== -1) return n;
    }
    return null;
  }

  function linkAt(node, editor) {
    for (var n = node; n && n !== editor; n = n.parentNode) {
      if (n.nodeType === 1 && n.nodeName === 'A') return n;
    }
    return null;
  }

  function closestLink(target, editor) {
    var a = target && target.closest ? target.closest('a[href]') : null;
    return a && editor.contains(a) ? a : null;
  }

  function selectRange(range) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function selectionRangeIn(editor) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    return editor.contains(r.commonAncestorContainer) ? r : null;
  }

  function looksLikeUrl(text) {
    return /^(https?:\/\/|mailto:|www\.)\S+$/i.test(text);
  }

  function unwrap(node) {
    var parent = node.parentNode;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  function setEditingDefaults() {
    exec('defaultParagraphSeparator', 'p');
    exec('styleWithCSS', false);
  }

  // ---------- content ----------

  function stripStyles(editor) {
    var styled = editor.querySelectorAll('[style]');
    for (var i = 0; i < styled.length; i++) styled[i].removeAttribute('style');
  }

  function decorateLinks(editor) {
    var links = editor.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('target', '_blank');
      links[i].setAttribute('rel', 'noopener noreferrer');
    }
  }

  function updateEmptyState(editor) {
    var empty = !/\S/.test(editor.textContent) && !editor.querySelector('li');
    editor.classList.toggle('is-empty', empty);
  }

  function notify(editor) {
    stripStyles(editor);
    updateEmptyState(editor);
    onChange(editor.dataset.key);
  }

  function setContent(editor, html) {
    var clean = M.sanitizeHtml(html || '');
    editor.innerHTML = clean || '<p><br></p>';
    decorateLinks(editor);
    updateEmptyState(editor);
  }

  function getContent(editor) {
    return M.sanitizeHtml(editor.innerHTML);
  }

  function focusEditor(editor) {
    editor.focus({ preventScroll: true });
    var range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selectRange(range);
  }

  // ---------- toolbar ----------

  // Returns the editor a toolbar action applies to, restoring focus and the
  // last selection if focus had moved to the toolbar.
  function restoreEditorFocus() {
    var active = editorFor(document.activeElement);
    if (active) return active;
    if (!lastEditor || !document.body.contains(lastEditor)) return null;
    lastEditor.focus({ preventScroll: true });
    if (lastRange && lastEditor.contains(lastRange.commonAncestorContainer)) selectRange(lastRange);
    return lastEditor;
  }

  function runCommand(command) {
    var editor = restoreEditorFocus();
    if (!editor) return;
    if (command === 'link') {
      openLinkPopover(editor);
      return;
    }
    exec(command);
    notify(editor);
    updateToolbar();
  }

  function updateToolbar() {
    if (!toolbar) return;
    var sel = window.getSelection();
    var selEditor = sel && sel.rangeCount ? editorFor(sel.getRangeAt(0).commonAncestorContainer) : null;
    var focused = !!editorFor(document.activeElement);
    var live = selEditor && focused;
    var usable = live || (!!lastEditor && (toolbar.contains(document.activeElement) || isPopoverOpen()));
    toolbar.classList.toggle('is-inactive', !usable);

    var buttons = toolbar.querySelectorAll('[data-command]');
    for (var i = 0; i < buttons.length; i++) {
      var command = buttons[i].dataset.command;
      var on = false;
      if (live) {
        if (command === 'link') {
          on = !!linkAt(sel.anchorNode, selEditor);
        } else {
          try { on = document.queryCommandState(command); } catch (e) { on = false; }
        }
      }
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function onSelectionChange() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var r = sel.getRangeAt(0);
      var editor = editorFor(r.commonAncestorContainer);
      if (editor) {
        lastEditor = editor;
        lastRange = r.cloneRange();
      }
    }
    updateToolbar();
  }

  // ---------- link popover ----------

  function isPopoverOpen() {
    return !!pop.el && !pop.el.hidden;
  }

  function showError(message) {
    pop.error.textContent = message;
    pop.error.hidden = false;
  }

  function hideError() {
    pop.error.textContent = '';
    pop.error.hidden = true;
  }

  function positionPopover(range, editor) {
    var rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      var rects = range.getClientRects();
      rect = rects.length ? rects[0] : null;
    }
    if (!rect || (!rect.width && !rect.height && !rect.top && !rect.left)) {
      rect = editor.getBoundingClientRect();
    }
    var width = pop.el.offsetWidth;
    var viewport = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(rect.left, viewport - width - 8));
    pop.el.style.left = (left + window.scrollX) + 'px';
    pop.el.style.top = (rect.bottom + window.scrollY + 8) + 'px';
  }

  function openLinkPopover(editor) {
    var range = selectionRangeIn(editor);
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    var link = linkAt(range.commonAncestorContainer, editor) || linkAt(range.startContainer, editor);
    var hasLinks = !!link || Array.prototype.some.call(editor.querySelectorAll('a[href]'), function (a) {
      return range.intersectsNode(a);
    });
    var selected = range.toString().trim();

    pop.state = { editor: editor, range: range.cloneRange(), link: link, hasLinks: hasLinks };
    pop.input.value = link ? link.getAttribute('href') : (looksLikeUrl(selected) ? selected : '');
    pop.removeBtn.hidden = !hasLinks;
    hideError();
    pop.el.hidden = false;
    positionPopover(range, editor);
    pop.input.focus();
    pop.input.select();
    updateToolbar();
  }

  function closePopover(restoreSelection) {
    if (!isPopoverOpen()) return;
    pop.el.hidden = true;
    var st = pop.state;
    if (restoreSelection && st && document.body.contains(st.editor)) {
      st.editor.focus({ preventScroll: true });
      try { selectRange(st.range); } catch (e) { /* range no longer valid */ }
    }
    updateToolbar();
  }

  function applyLink() {
    var st = pop.state;
    if (!st) return;
    var raw = pop.input.value.trim();
    if (!raw) {
      if (st.hasLinks) removeLink(); else closePopover(true);
      return;
    }
    var url = M.normalizeUrl(raw);
    if (!url) {
      showError('Use a web address (http or https) or an email address.');
      pop.input.focus();
      return;
    }
    var editor = st.editor;
    closePopover(true);
    if (st.link && editor.contains(st.link)) {
      st.link.setAttribute('href', url);
    } else if (st.range.collapsed) {
      exec('insertHTML', '<a href="' + escapeHtml(url) + '">' + escapeHtml(raw) + '</a>');
    } else {
      exec('createLink', url);
    }
    decorateLinks(editor);
    notify(editor);
    updateToolbar();
  }

  function removeLink() {
    var st = pop.state;
    if (!st) return;
    var editor = st.editor;
    closePopover(true);
    if (st.link && editor.contains(st.link)) {
      var r = document.createRange();
      r.selectNode(st.link);
      selectRange(r);
    }
    exec('unlink');
    if (st.link && editor.contains(st.link)) unwrap(st.link); // browser left it in place
    notify(editor);
    updateToolbar();
  }

  // ---------- paste and drop ----------

  function insertClean(html, text) {
    var trimmed = (text || '').trim();
    var url = trimmed && looksLikeUrl(trimmed) ? M.normalizeUrl(trimmed) : null;
    if (url) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) exec('createLink', url);
      else exec('insertHTML', '<a href="' + escapeHtml(url) + '">' + escapeHtml(trimmed) + '</a>');
    } else if (html) {
      var clean = M.sanitizeHtml(html);
      // A single paragraph is inserted inline so it joins the current line.
      var single = /^<p>([\s\S]*)<\/p>$/.exec(clean);
      if (single && single[1].indexOf('</p>') === -1) clean = single[1];
      if (clean) exec('insertHTML', clean);
    } else if (text) {
      exec('insertText', text);
    }
  }

  function onPaste(e) {
    var editor = e.currentTarget;
    var cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    var html = cd.getData('text/html');
    var text = cd.getData('text/plain');
    if (!html && !text) return;
    insertClean(html, text);
    decorateLinks(editor);
    notify(editor);
  }

  function caretRangeAtPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      var r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
    return null;
  }

  function onDrop(e) {
    if (internalDrag) return; // moving text within the page: default behavior, cleaned on input
    var dt = e.dataTransfer;
    if (!dt || (dt.files && dt.files.length)) return; // files are handled by the page (open JSON)
    var html = dt.getData('text/html');
    var text = dt.getData('text/plain');
    if (!html && !text) return;
    e.preventDefault();
    var editor = e.currentTarget;
    editor.focus({ preventScroll: true });
    var range = caretRangeAtPoint(e.clientX, e.clientY);
    if (range && editor.contains(range.startContainer)) selectRange(range);
    insertClean(html, text);
    decorateLinks(editor);
    notify(editor);
  }

  // ---------- per-editor events ----------

  function onEditorKeyDown(e) {
    var mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    var key = (e.key || '').toLowerCase();
    var commands = { b: 'bold', i: 'italic', u: 'underline', k: 'link' };
    if (commands[key]) {
      e.preventDefault();
      runCommand(commands[key]);
    }
  }

  function onEditorClick(e) {
    var a = closestLink(e.target, e.currentTarget);
    if (!a || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    var url = M.normalizeUrl(a.getAttribute('href'));
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function onEditorMouseOver(e) {
    var a = closestLink(e.target, e.currentTarget);
    if (a) a.title = a.getAttribute('href') + '\n' + MOD_LABEL + '+click to open';
  }

  function createEditor(el, key, placeholder) {
    el.classList.add('editor');
    el.dataset.key = key;
    el.dataset.placeholder = placeholder || '';
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('spellcheck', 'true');
    el.addEventListener('focus', setEditingDefaults);
    el.addEventListener('input', function () { notify(el); });
    el.addEventListener('keydown', onEditorKeyDown);
    el.addEventListener('paste', onPaste);
    el.addEventListener('drop', onDrop);
    el.addEventListener('click', onEditorClick);
    el.addEventListener('mouseover', onEditorMouseOver);
    editors.push(el);
    setContent(el, '');
    return el;
  }

  // ---------- setup ----------

  function setModifierClass(e) {
    document.body.classList.toggle('modifier-pressed', !!(e.metaKey || e.ctrlKey));
  }

  function init(options) {
    onChange = options.onChange || onChange;
    toolbar = options.toolbar;
    pop.el = options.popover;
    pop.input = pop.el.querySelector('input');
    pop.error = pop.el.querySelector('.link-error');
    pop.removeBtn = pop.el.querySelector('[data-action="remove"]');

    var buttons = toolbar.querySelectorAll('[data-command]');
    Array.prototype.forEach.call(buttons, function (btn) {
      var label = btn.dataset.label;
      var shortcut = btn.dataset.shortcut;
      btn.title = label + (shortcut ? ' (' + MOD_LABEL + '+' + shortcut + ')' : '');
      btn.setAttribute('aria-label', label);
      // Keep focus and selection in the editor when clicked with a mouse.
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () { runCommand(btn.dataset.command); });
    });

    pop.el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      applyLink();
    });
    pop.el.querySelector('[data-action="cancel"]').addEventListener('click', function () { closePopover(true); });
    pop.removeBtn.addEventListener('click', removeLink);
    pop.el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePopover(true); }
    });
    pop.input.addEventListener('input', hideError);
    document.addEventListener('mousedown', function (e) {
      if (isPopoverOpen() && !pop.el.contains(e.target)) closePopover(false);
    });

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('focusin', updateToolbar);
    document.addEventListener('focusout', function () { setTimeout(updateToolbar, 0); });
    document.addEventListener('dragstart', function () { internalDrag = true; });
    document.addEventListener('dragend', function () { internalDrag = false; });
    window.addEventListener('keydown', setModifierClass);
    window.addEventListener('keyup', setModifierClass);
    window.addEventListener('blur', function () { document.body.classList.remove('modifier-pressed'); });

    updateToolbar();
  }

  M.editing = {
    init: init,
    createEditor: createEditor,
    setContent: setContent,
    getContent: getContent,
    focusEditor: focusEditor,
    closePopover: closePopover,
    isMac: IS_MAC,
    modLabel: MOD_LABEL
  };
})(window.Meddpicc = window.Meddpicc || {});

/*
 * MEDDPICC Editor: application wiring.
 * Builds the page from config, holds the current document, and connects
 * New / Open / Download, the browser working copy, and the status indicator.
 */
(function (M) {
  'use strict';

  var PERSIST_DELAY_MS = 500;
  var UNTITLED = 'Untitled opportunity';

  var state = {
    doc: null,
    notDownloaded: false,   // edits exist that are not in a downloaded file
    storageOk: true,
    savedInBrowser: false,
    persistTimer: null
  };

  var els = {};
  var ui = { editors: {}, boxes: {}, chips: {}, statusLabels: {}, radios: {} };

  function byId(id) { return document.getElementById(id); }

  function h(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function sectionsInGroup(groupId) {
    return M.SECTIONS.filter(function (s) { return s.group === groupId; });
  }

  // ---------- building the page ----------

  function buildNextSteps(slot) {
    var box = h('section', 'box next-steps');
    var header = h('div', 'box-header');
    var heading = h('h2', 'box-heading', M.NEXT_STEPS.heading);
    heading.id = 'heading-' + M.NEXT_STEPS.key;
    box.setAttribute('aria-labelledby', heading.id);
    header.appendChild(heading);

    var editor = h('div');
    editor.setAttribute('aria-labelledby', heading.id);
    M.editing.createEditor(editor, M.NEXT_STEPS.key, M.NEXT_STEPS.prompt);

    box.appendChild(header);
    box.appendChild(editor);
    slot.appendChild(box);
    ui.editors[M.NEXT_STEPS.key] = editor;
  }

  function buildPicker(section) {
    var fieldset = h('fieldset', 'status-picker');
    fieldset.appendChild(h('legend', 'visually-hidden', section.heading + ' status'));
    ui.radios[section.key] = {};

    M.STATUSES.forEach(function (s) {
      var option = h('label', 'swatch-option');
      option.title = s.label ? s.name + ': ' + s.label : s.name;

      var input = h('input', 'swatch-input');
      input.type = 'radio';
      input.name = 'status-' + section.key;
      input.value = s.value;
      input.setAttribute('aria-label', s.label ? s.name + ', ' + s.label : s.name);
      input.addEventListener('change', function () {
        if (input.checked) setStatus(section.key, s.value, true);
      });

      var swatch = h('span', 'swatch');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.setProperty('--swatch', s.swatch);

      option.appendChild(input);
      option.appendChild(swatch);
      fieldset.appendChild(option);
      ui.radios[section.key][s.value] = input;
    });
    return fieldset;
  }

  function buildBox(section) {
    var key = section.key;
    var box = h('section', 'box framework-box');
    box.dataset.key = key;

    var header = h('div', 'box-header');
    var letter = h('span', 'letter', section.letter);
    letter.setAttribute('aria-hidden', 'true');
    var heading = h('h2', 'box-heading', section.heading);
    heading.id = 'heading-' + key;
    box.setAttribute('aria-labelledby', heading.id);
    var label = h('span', 'status-label');

    // Heading and label share a wrapping block so a long label wraps under
    // the heading instead of pushing the picker onto its own line.
    var titleBlock = h('div', 'box-title');
    titleBlock.appendChild(heading);
    titleBlock.appendChild(label);

    header.appendChild(letter);
    header.appendChild(titleBlock);
    header.appendChild(buildPicker(section));

    var editor = h('div');
    editor.setAttribute('aria-labelledby', heading.id);
    M.editing.createEditor(editor, key, section.prompt);

    box.appendChild(header);
    box.appendChild(editor);

    ui.boxes[key] = box;
    ui.editors[key] = editor;
    ui.statusLabels[key] = label;
    return box;
  }

  function buildSections(container) {
    M.GROUPS.forEach(function (group, i) {
      if (i > 0) container.appendChild(h('hr', 'group-separator'));
      var grid = h('div', 'box-grid group-' + group.id);
      sectionsInGroup(group.id).forEach(function (s) { grid.appendChild(buildBox(s)); });
      container.appendChild(grid);
    });
  }

  function buildSummaryStrip(strip) {
    M.GROUPS.forEach(function (group, i) {
      if (i > 0) {
        var sep = h('span', 'chip-sep');
        sep.setAttribute('aria-hidden', 'true');
        strip.appendChild(sep);
      }
      sectionsInGroup(group.id).forEach(function (s) {
        var chip = h('button', 'chip', s.letter);
        chip.type = 'button';
        chip.addEventListener('click', function () { focusSection(s.key); });
        strip.appendChild(chip);
        ui.chips[s.key] = chip;
      });
    });
  }

  function focusSection(key) {
    ui.boxes[key].scrollIntoView({ behavior: 'smooth', block: 'center' });
    M.editing.focusEditor(ui.editors[key]);
  }

  // ---------- document <-> UI ----------

  function setStatus(key, value, fromUser) {
    var s = M.statusByValue(value) || M.statusByValue(M.DEFAULT_STATUS);
    var section = M.sectionByKey(key);
    state.doc.sections[key].status = s.value;

    var box = ui.boxes[key];
    box.dataset.status = s.value;
    box.style.setProperty('--tint', s.tint);
    box.style.setProperty('--border', s.border);
    ui.statusLabels[key].textContent = s.label;

    var radio = ui.radios[key][s.value];
    if (!radio.checked) radio.checked = true;

    var chip = ui.chips[key];
    var description = section.heading + (s.label ? ': ' + s.label : '');
    chip.style.setProperty('--chip-bg', s.swatch);
    chip.style.setProperty('--chip-ink', s.chipText);
    chip.title = description;
    chip.setAttribute('aria-label', description);

    if (fromUser) markChanged();
  }

  function syncTitleDisplay() {
    var t = els.title.value.trim();
    els.printTitle.textContent = t || UNTITLED;
    document.title = (t ? t + ' · ' : '') + 'MEDDPICC Editor';
  }

  function syncFromUi() {
    state.doc.title = M.cleanTitle(els.title.value);
    state.doc.next_steps.content = M.editing.getContent(ui.editors[M.NEXT_STEPS.key]);
    M.SECTIONS.forEach(function (s) {
      state.doc.sections[s.key].content = M.editing.getContent(ui.editors[s.key]);
    });
  }

  function loadIntoUi(doc) {
    M.editing.closePopover(false);
    state.doc = doc;
    els.title.value = doc.title;
    syncTitleDisplay();
    M.editing.setContent(ui.editors[M.NEXT_STEPS.key], doc.next_steps.content);
    M.SECTIONS.forEach(function (s) {
      M.editing.setContent(ui.editors[s.key], doc.sections[s.key].content);
      setStatus(s.key, doc.sections[s.key].status, false);
    });
  }

  // ---------- working copy and indicator ----------

  function updateIndicator() {
    var storageText = '';
    if (!state.storageOk) storageText = 'Not saved in browser';
    else if (state.savedInBrowser) storageText = 'Saved in browser';
    els.storageState.textContent = storageText;
    els.storageState.classList.toggle('is-error', !state.storageOk);
    els.downloadState.textContent = state.notDownloaded ? 'Not downloaded since last change' : '';
  }

  function showStorageBanner() {
    els.storageBanner.hidden = false;
  }

  function persistNow() {
    clearTimeout(state.persistTimer);
    state.persistTimer = null;
    if (state.storageOk) {
      syncFromUi();
      if (M.storage.writeWorkingCopy(state.doc, state.notDownloaded)) {
        state.savedInBrowser = true;
      } else {
        state.storageOk = false;
        state.savedInBrowser = false;
        showStorageBanner();
      }
    }
    updateIndicator();
  }

  function schedulePersist() {
    if (!state.storageOk) return;
    clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
  }

  function flushPersist() {
    if (state.persistTimer) persistNow();
  }

  function markChanged() {
    state.notDownloaded = true;
    schedulePersist();
    updateIndicator();
  }

  // ---------- notifications ----------

  function toast(message, kind) {
    kind = kind || 'info';
    var t = h('div', 'toast toast-' + kind);
    if (kind === 'error') t.setAttribute('role', 'alert');
    var close = h('button', 'toast-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', function () { t.remove(); });
    t.appendChild(h('span', 'toast-message', message));
    t.appendChild(close);
    els.toasts.appendChild(t);
    if (kind !== 'error') {
      setTimeout(function () { t.remove(); }, kind === 'warn' ? 10000 : 4000);
    }
  }

  var DISCARD_PROMPT = "You have changes that haven't been downloaded.";

  // ---------- actions ----------

  function newDocument() {
    if (state.notDownloaded && !window.confirm(DISCARD_PROMPT + ' Start a new document and discard them?')) return;
    loadIntoUi(M.createEmptyDocument());
    state.notDownloaded = false;
    persistNow();
    els.title.focus();
  }

  function openFile(file) {
    M.readFileAsText(file).then(function (text) {
      var result = M.parseDocumentText(text);
      if (!result.ok) {
        toast(result.error + ' Nothing was changed.', 'error');
        return;
      }
      if (state.notDownloaded &&
          !window.confirm(DISCARD_PROMPT + ' Open "' + file.name + '" and replace them?')) return;
      loadIntoUi(result.doc);
      state.notDownloaded = false;
      persistNow();
      toast('Opened ' + file.name + '.', 'info');
      result.warnings.forEach(function (w) { toast(w, 'warn'); });
    }, function (err) {
      var detail = err && /too large/.test(err.message) ? err.message : "That file couldn't be read.";
      toast(detail + ' Nothing was changed.', 'error');
    });
  }

  function download() {
    M.editing.closePopover(false);
    syncFromUi();
    state.doc.updated_at = M.isoNow();
    var filename = M.downloadDocument(state.doc);
    state.notDownloaded = false;
    persistNow();
    toast('Downloaded ' + filename + '.', 'info');
  }

  // ---------- page-level events ----------

  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function wireFileDrop() {
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      document.body.classList.add('is-dragging-file');
    });
    window.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget) document.body.classList.remove('is-dragging-file');
    });
    window.addEventListener('drop', function (e) {
      document.body.classList.remove('is-dragging-file');
      if (!hasFiles(e)) return;
      e.preventDefault();
      var file = e.dataTransfer.files[0];
      if (file) openFile(file);
    });
  }

  // Links whose text is already the URL don't need it printed twice.
  function markLinksForPrint() {
    var links = document.querySelectorAll('.editor a[href]');
    Array.prototype.forEach.call(links, function (a) {
      var strip = function (s) { return s.replace(/^(https?:\/\/|mailto:)/i, '').replace(/\/$/, ''); };
      a.classList.toggle('print-url-same', strip(a.textContent.trim()) === strip(a.getAttribute('href')));
    });
  }

  function wireEvents() {
    els.title.addEventListener('input', function () {
      syncTitleDisplay();
      markChanged();
    });
    els.title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        M.editing.focusEditor(ui.editors[M.NEXT_STEPS.key]);
      }
    });

    byId('btn-new').addEventListener('click', newDocument);
    byId('btn-open').addEventListener('click', function () { els.fileInput.click(); });
    byId('btn-download').addEventListener('click', download);
    els.fileInput.addEventListener('change', function () {
      var file = els.fileInput.files && els.fileInput.files[0];
      els.fileInput.value = ''; // allow reopening the same file
      if (file) openFile(file);
    });

    window.addEventListener('keydown', function (e) {
      var mod = M.editing.isMac ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key || '').toLowerCase() === 's') {
        e.preventDefault();
        download();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushPersist();
    });
    window.addEventListener('pagehide', flushPersist);
    window.addEventListener('beforeprint', markLinksForPrint);

    window.addEventListener('storage', function (e) {
      if (e.key === M.STORAGE_KEYS.workingCopy || e.key === null) els.tabBanner.hidden = false;
    });
    els.tabBanner.querySelector('button').addEventListener('click', function () {
      els.tabBanner.hidden = true;
    });

    wireFileDrop();
  }

  // ---------- startup ----------

  function restoreOrStartBlank() {
    var restored = state.storageOk ? M.storage.readWorkingCopy() : null;
    if (restored && restored.ok) {
      loadIntoUi(restored.doc);
      state.notDownloaded = restored.notDownloaded;
      state.savedInBrowser = true;
      restored.warnings.forEach(function (w) { toast(w, 'warn'); });
      return;
    }
    if (restored && !restored.ok) {
      toast('The working copy saved in this browser could not be read, so a blank document was started.', 'warn');
    }
    loadIntoUi(M.createEmptyDocument());
  }

  function init() {
    els.title = byId('title');
    els.printTitle = byId('print-title');
    els.storageState = byId('storage-state');
    els.downloadState = byId('download-state');
    els.storageBanner = byId('storage-banner');
    els.tabBanner = byId('tab-banner');
    els.toasts = byId('toasts');
    els.fileInput = byId('file-input');

    M.editing.init({
      toolbar: byId('format-toolbar'),
      popover: byId('link-popover'),
      onChange: markChanged
    });

    buildNextSteps(byId('next-steps-slot'));
    buildSections(byId('sections'));
    buildSummaryStrip(byId('summary-strip'));
    byId('btn-download').title = 'Download as JSON (' + M.editing.modLabel + '+S)';

    state.storageOk = M.storage.isAvailable();
    if (!state.storageOk) showStorageBanner();

    restoreOrStartBlank();
    wireEvents();
    updateIndicator();
  }

  M.app = { init: init };
  init();
})(window.Meddpicc = window.Meddpicc || {});

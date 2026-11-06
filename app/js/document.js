/*
 * MEDDPICC Editor: document model.
 * Creating, validating, normalizing, and serializing the JSON document.
 * Pure functions with no UI, so they can be unit tested.
 */
(function (M) {
  'use strict';

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function createEmptyDocument() {
    var sections = {};
    M.SECTIONS.forEach(function (s) {
      sections[s.key] = { status: M.DEFAULT_STATUS, content: '' };
    });
    return {
      format: M.FORMAT,
      version: M.VERSION,
      title: '',
      updated_at: null,
      next_steps: { content: '' },
      sections: sections
    };
  }

  // The title is a single line of plain text.
  function cleanTitle(title) {
    return typeof title === 'string' ? title.replace(/[\r\n\t]+/g, ' ') : '';
  }

  function cleanContent(content) {
    return typeof content === 'string' ? M.sanitizeHtml(content) : '';
  }

  /*
   * Fills defaults for anything missing, resets unknown statuses, sanitizes
   * all rich text, and drops unknown keys. Pushes human-readable messages
   * onto `warnings`.
   */
  function normalizeDocument(data, warnings) {
    var doc = createEmptyDocument();
    var defaultName = M.statusByValue(M.DEFAULT_STATUS).name;

    doc.title = cleanTitle(data.title);
    doc.updated_at = typeof data.updated_at === 'string' ? data.updated_at : null;
    doc.next_steps.content = cleanContent(isPlainObject(data.next_steps) ? data.next_steps.content : '');

    var sections = isPlainObject(data.sections) ? data.sections : {};
    M.SECTIONS.forEach(function (s) {
      var raw = isPlainObject(sections[s.key]) ? sections[s.key] : {};
      var status = raw.status;
      if (status === undefined || status === null) {
        status = M.DEFAULT_STATUS;
      } else if (!M.statusByValue(status)) {
        warnings.push('Unknown status "' + String(status).slice(0, 40) + '" on ' + s.heading +
          ' was reset to ' + defaultName + '.');
        status = M.DEFAULT_STATUS;
      }
      doc.sections[s.key] = { status: status, content: cleanContent(raw.content) };
    });
    return doc;
  }

  /*
   * Validates an already-parsed value.
   * Returns { ok: true, doc, warnings } or { ok: false, error }.
   */
  function parseDocumentData(data) {
    if (!isPlainObject(data) || data.format !== M.FORMAT) {
      return { ok: false, error: "This file isn't a MEDDPICC editor document." };
    }
    var v = data.version;
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1) {
      return { ok: false, error: 'This file has a missing or invalid version number.' };
    }
    var warnings = [];
    if (v > M.VERSION) {
      warnings.push('This file was made by a newer version of the editor (version ' + v +
        '). Some details may not load.');
    }
    return { ok: true, doc: normalizeDocument(data, warnings), warnings: warnings };
  }

  function parseDocumentText(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "This file isn't valid JSON." };
    }
    return parseDocumentData(data);
  }

  // Fixed key order, 2-space indent, trailing newline: diff-friendly.
  function serializeDocument(doc) {
    var sections = {};
    M.SECTIONS.forEach(function (s) {
      var sec = (doc.sections && doc.sections[s.key]) || {};
      sections[s.key] = { status: sec.status || M.DEFAULT_STATUS, content: sec.content || '' };
    });
    var ordered = {
      format: M.FORMAT,
      version: M.VERSION,
      title: doc.title || '',
      updated_at: doc.updated_at || null,
      next_steps: { content: (doc.next_steps && doc.next_steps.content) || '' },
      sections: sections
    };
    return JSON.stringify(ordered, null, 2) + '\n';
  }

  function filenameFromTitle(title) {
    var base = String(title || '')
      .replace(/[\\\/:*?"<>|\u0000-\u001F\u007F]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');
    if (base.length > 100) base = base.slice(0, 100).replace(/[-.]+$/, '');
    return (base || 'meddpicc') + '.json';
  }

  // ISO 8601 UTC without milliseconds, e.g. 2026-11-06T15:30:00Z.
  function isoNow(date) {
    return (date || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  M.createEmptyDocument = createEmptyDocument;
  M.normalizeDocument = normalizeDocument;
  M.parseDocumentData = parseDocumentData;
  M.parseDocumentText = parseDocumentText;
  M.serializeDocument = serializeDocument;
  M.filenameFromTitle = filenameFromTitle;
  M.cleanTitle = cleanTitle;
  M.isoNow = isoNow;
})(window.Meddpicc = window.Meddpicc || {});

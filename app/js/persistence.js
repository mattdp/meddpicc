/*
 * MEDDPICC Editor: persistence.
 *   - Download: the JSON file is offered as a browser download.
 *   - Open: reading a user-chosen file.
 *   - Working copy: the current document mirrored into localStorage so a
 *     closed tab or crashed browser loses nothing.
 */
(function (M) {
  'use strict';

  var MAX_FILE_BYTES = 10 * 1024 * 1024;

  function getStorage() {
    try {
      var s = window.localStorage;
      var probe = 'meddpicc-editor:probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null; // disabled, blocked for file:// pages, or full
    }
  }

  function isAvailable() {
    return getStorage() !== null;
  }

  /*
   * Returns null when there is no working copy,
   * { ok: true, doc, warnings, notDownloaded } when it was restored, or
   * { ok: false, error } when it exists but cannot be read.
   */
  function readWorkingCopy() {
    var s = getStorage();
    if (!s) return null;
    var raw;
    try { raw = s.getItem(M.STORAGE_KEYS.workingCopy); } catch (e) { return null; }
    if (!raw) return null;
    var result = M.parseDocumentText(raw);
    if (!result.ok) return result;
    var flag = null;
    try { flag = s.getItem(M.STORAGE_KEYS.notDownloaded); } catch (e) { /* ignore */ }
    result.notDownloaded = flag === 'true';
    return result;
  }

  // Returns true on success, false if storage is unavailable or full.
  function writeWorkingCopy(doc, notDownloaded) {
    var s = getStorage();
    if (!s) return false;
    try {
      s.setItem(M.STORAGE_KEYS.workingCopy, M.serializeDocument(doc));
      s.setItem(M.STORAGE_KEYS.notDownloaded, notDownloaded ? 'true' : 'false');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Triggers a browser download and returns the filename used.
  function downloadDocument(doc) {
    var filename = M.filenameFromTitle(doc.title);
    var blob = new Blob([M.serializeDocument(doc)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return filename;
  }

  function readFileAsText(file) {
    if (file.size > MAX_FILE_BYTES) {
      return Promise.reject(new Error('This file is too large to be a MEDDPICC document.'));
    }
    if (typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(reader.error || new Error('Read failed')); };
      reader.readAsText(file);
    });
  }

  M.storage = {
    isAvailable: isAvailable,
    readWorkingCopy: readWorkingCopy,
    writeWorkingCopy: writeWorkingCopy
  };
  M.downloadDocument = downloadDocument;
  M.readFileAsText = readFileAsText;
})(window.Meddpicc = window.Meddpicc || {});

/*
 * MEDDPICC Editor: configuration.
 * Single source of truth for sections (order, groups, headings) and statuses
 * (values, colors, labels). Layout and persistence code read from here.
 */
(function (M) {
  'use strict';

  M.FORMAT = 'meddpicc-editor';
  M.VERSION = 1;

  M.STORAGE_KEYS = Object.freeze({
    workingCopy: 'meddpicc-editor:working-copy',
    notDownloaded: 'meddpicc-editor:not-downloaded'
  });

  M.DEFAULT_STATUS = 'white';

  // Picker order follows this array.
  //   swatch:   color of the picker swatch and summary chip
  //   tint:     light box background
  //   border:   strong left border of the box
  //   chipText: text color on top of the swatch color (summary strip)
  M.STATUSES = Object.freeze([
    { value: 'white',  name: 'White',  label: '',                                  swatch: '#ffffff', tint: '#ffffff', border: '#d0d7de', chipText: '#1f2328' },
    { value: 'red',    name: 'Red',    label: 'Risky and presently important',     swatch: '#d93025', tint: '#fdecea', border: '#d93025', chipText: '#ffffff' },
    { value: 'yellow', name: 'Yellow', label: 'Risky, not presently as important', swatch: '#f9c513', tint: '#fff8db', border: '#e0a800', chipText: '#1f2328' },
    { value: 'green',  name: 'Green',  label: 'Excellent',                         swatch: '#188038', tint: '#e6f4ea', border: '#188038', chipText: '#ffffff' },
    { value: 'blue',   name: 'Blue',   label: 'Okay',                              swatch: '#1a73e8', tint: '#e8f0fe', border: '#1a73e8', chipText: '#ffffff' },
    { value: 'gray',   name: 'Gray',   label: 'Presently irrelevant',              swatch: '#6b7280', tint: '#f0f1f3', border: '#6b7280', chipText: '#ffffff' }
  ].map(function (s) { return Object.freeze(s); }));

  // Groups render in this order, with a separator between consecutive groups.
  M.GROUPS = Object.freeze([
    Object.freeze({ id: 'priority' }),
    Object.freeze({ id: 'secondary' })
  ]);

  // Display order (deliberately not MEDDPICC letter order).
  M.SECTIONS = Object.freeze([
    { key: 'metrics',           letter: 'M', heading: 'Metrics',           group: 'priority',
      prompt: 'What quantifiable outcomes does the customer expect?' },
    { key: 'economic_buyer',    letter: 'E', heading: 'Economic Buyer',    group: 'priority',
      prompt: 'Who has final authority to release funds?' },
    { key: 'champion',          letter: 'C', heading: 'Champion',          group: 'priority',
      prompt: 'Who is selling on our behalf internally, and why?' },
    { key: 'identify_pain',     letter: 'I', heading: 'Identify Pain',     group: 'priority',
      prompt: 'What business pain is driving this, and what does inaction cost?' },
    { key: 'decision_criteria', letter: 'D', heading: 'Decision Criteria', group: 'secondary',
      prompt: 'How will they evaluate and compare solutions?' },
    { key: 'decision_process',  letter: 'D', heading: 'Decision Process',  group: 'secondary',
      prompt: 'What steps, people, and timeline lead to a decision?' },
    { key: 'paper_process',     letter: 'P', heading: 'Paper Process',     group: 'secondary',
      prompt: 'What legal, procurement, and security steps are needed to sign?' },
    { key: 'competition',       letter: 'C', heading: 'Competition',       group: 'secondary',
      prompt: 'Who or what else are they considering, including doing nothing?' }
  ].map(function (s) { return Object.freeze(s); }));

  M.NEXT_STEPS = Object.freeze({
    key: 'next_steps',
    heading: 'Next Steps',
    prompt: 'What happens next, who owns it, and by when?'
  });

  M.statusByValue = function (value) {
    for (var i = 0; i < M.STATUSES.length; i++) {
      if (M.STATUSES[i].value === value) return M.STATUSES[i];
    }
    return null;
  };

  M.sectionByKey = function (key) {
    for (var i = 0; i < M.SECTIONS.length; i++) {
      if (M.SECTIONS[i].key === key) return M.SECTIONS[i];
    }
    return null;
  };
})(window.Meddpicc = window.Meddpicc || {});

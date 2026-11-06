# MEDDPICC Editor: Specification

Status: v0.2, implemented (2026-11-06). Decisions from review are
incorporated. The build follows the assumptions in Section 11 and includes
the optional summary strip, drag-and-drop open, and the other-tab warning
(Q5).

## 1. Summary

A local, single-user, browser-based editor for qualifying a sales opportunity
using the MEDDPICC framework. The user opens a page in their browser, fills in
a title, an overall Next Steps box, and eight framework boxes, tags each
framework box with a status color, and downloads/opens the whole thing as a
JSON file. The browser also keeps a working copy so an accidentally closed tab
loses nothing.

### Non-goals

- No hosting, deployment, or remote server. No Python or other backend.
- No collaboration, sharing, or real-time sync.
- No authentication or user accounts.
- No database. The JSON file is the durable storage; browser storage is only a
  crash/close safety net.
- No CRM integration.
- No full word-processor feature set (tables, images, fonts, text color).
- One opportunity per file. No multi-deal list, dashboard, or recent-files menu.
- No per-box metadata (owner, last-updated date, confidence, etc.).

## 2. Sections

### 2.1 Display order

The eight framework boxes are shown in a **priority order**, deliberately not
in MEDDPICC letter order. The top four are the most important criteria; a
visual separator divides them from the remaining four.

**Priority group (top):**

| # | Key              | Letter | Heading        | Placeholder prompt |
|---|------------------|--------|----------------|--------------------|
| 1 | `metrics`        | M | Metrics        | What quantifiable outcomes does the customer expect? |
| 2 | `economic_buyer` | E | Economic Buyer | Who has final authority to release funds? |
| 3 | `champion`       | C | Champion       | Who is selling on our behalf internally, and why? |
| 4 | `identify_pain`  | I | Identify Pain  | What business pain is driving this, and what does inaction cost? |

**Separator** (Section 3).

**Secondary group (below), in MEDDPICC order:**

| # | Key                 | Letter | Heading           | Placeholder prompt |
|---|---------------------|--------|-------------------|--------------------|
| 5 | `decision_criteria` | D | Decision Criteria | How will they evaluate and compare solutions? |
| 6 | `decision_process`  | D | Decision Process  | What steps, people, and timeline lead to a decision? |
| 7 | `paper_process`     | P | Paper Process     | What legal, procurement, and security steps are needed to sign? |
| 8 | `competition`       | C | Competition       | Who or what else are they considering, including doing nothing? |

- The two D's and two C's are distinct boxes. Internal keys are used
  everywhere, never the bare letter.
- Section definitions (key, letter, heading, prompt, group, order) live in a
  single config constant, so reordering or renaming is a one-line change.

### 2.2 Each framework box shows

- A large letter badge (e.g. "M") and the heading (e.g. "Metrics").
- A status color picker (Section 4).
- A rich text editing area (Section 5).

### 2.3 Title

- Single-line plain text at the very top. No rich text.
- Placeholder: "Untitled opportunity".
- Used as the default download filename: strip characters invalid in
  filenames, collapse whitespace to `-`, append `.json`. Fall back to
  `meddpicc.json` if the title is empty.

### 2.4 Next Steps

- Full-width rich text box placed **directly below the title, above all
  framework boxes**.
- Same editor and formatting as the framework boxes.
- Has no status color.

## 3. Page layout

```
+--------------------------------------------------------------+
|  [Title: "Acme Corp - Q1 Renewal"]                            |
|  [New] [Open...] [Download]        Working copy saved locally |
+--------------------------------------------------------------+
|  NEXT STEPS (full width, rich text)                           |
+--------------------------------------------------------------+
|  M  Metrics        [color]  |  E  Economic Buyer  [color]     |
|  [rich text]                |  [rich text]                    |
+-----------------------------+---------------------------------+
|  C  Champion       [color]  |  I  Identify Pain   [color]     |
+-----------------------------+---------------------------------+
|                                                               |
|  =================== separator =============================  |
|                                                               |
+-----------------------------+---------------------------------+
|  D  Decision Criteria       |  D  Decision Process            |
+-----------------------------+---------------------------------+
|  P  Paper Process           |  C  Competition                 |
+-----------------------------+---------------------------------+
```

- Desktop: 2-column grid. Narrow windows (< ~800px): single column, still in
  the order of Section 2.1, with the separator kept between box 4 and box 5.
- The separator must be clearly visible: extra vertical space plus a
  horizontal rule. The priority group may also be visually heavier (slightly
  larger headings or padding), but must not change the box behavior.
- Each box shows its status as a light background tint plus a stronger colored
  left border. Text contrast meets WCAG AA on every status color.
- Boxes grow vertically with content (no internal scrolling).

## 4. Status colors

Each of the eight framework boxes has a color picker with exactly these
options:

| Value    | Color  | Label shown to user                  |
|----------|--------|--------------------------------------|
| `white`  | White  | *(no description)* Default.          |
| `red`    | Red    | Risky and presently important        |
| `yellow` | Yellow | Risky, not presently as important    |
| `green`  | Green  | Excellent                            |
| `blue`   | Blue   | Okay                                 |
| `gray`   | Gray   | Presently irrelevant                 |

Requirements:

- New documents start every box at `white`.
- `white` is selectable like any other option, so a user can clear a status.
  It has no description; its tooltip/accessible name is just "White".
- The picker is a row of swatches (or a compact dropdown of swatches) in the
  box header. Not a free-form color wheel.
- Every non-white swatch shows its label as a tooltip and as its accessible
  name, so meaning does not rely on color alone.
- The currently selected status label is visible on the box (e.g. small text
  next to the picker), not only on hover. White shows nothing.
- Statuses are defined in one config constant (value, display color, tint,
  label) so the palette and labels can change without touching layout or
  persistence code.
- JSON stores the status **value** (e.g. `"yellow"`), never a hex color.
- Nice-to-have: a summary strip in the header showing the eight letters
  colored by status, in display order (M E C I | D D P C), for one-glance
  deal health.

## 5. Rich text editing

Applies to Next Steps and all eight framework boxes.

### 5.1 Supported formatting

| Feature        | Shortcut                     | Stored as   |
|----------------|------------------------------|-------------|
| Bold           | Cmd/Ctrl+B                   | `<strong>`  |
| Italic         | Cmd/Ctrl+I                   | `<em>`      |
| Underline      | Cmd/Ctrl+U                   | `<u>`       |
| Hyperlink      | Cmd/Ctrl+K or toolbar button | `<a href>`  |
| Bulleted list  | toolbar button               | `<ul><li>`  |
| Numbered list  | toolbar button               | `<ol><li>`  |
| Paragraph / line break | Enter / Shift+Enter  | `<p>`, `<br>` |

Out of scope: headings, font family/size, text color, highlighting, tables,
images, embeds, code blocks, strikethrough.

### 5.2 Behavior

- One shared toolbar that acts on whichever box has focus (less clutter than
  one toolbar per box). Buttons reflect the current selection state.
- **Links:**
  - With text selected, inserting a link wraps the selection.
  - With no selection, the URL is inserted as the link text.
  - Allowed schemes: `http:`, `https:`, `mailto:`. A bare `example.com` is
    normalized to `https://example.com`. Anything else, notably
    `javascript:`, is rejected with a short inline message.
  - Rendered with `target="_blank" rel="noopener noreferrer"`.
  - **Cmd/Ctrl+click opens a link** in a new tab. A plain click places the
    cursor for editing. Hovering a link shows a hint: "Cmd+click to open"
    (Ctrl on non-Mac).
  - Editing/removing a link: place the cursor in it and use the link button
    (prefilled with the current URL; clearing it removes the link).
- **Paste** is reduced to the supported subset. Pasting from Google Docs, Word,
  or web pages must not import fonts, colors, or styles. A pasted bare URL
  becomes a link (nice-to-have).
- Undo/redo within a box uses the browser's native behavior.

### 5.3 Implementation

- No dependencies: `contenteditable` regions, a small custom toolbar, and a
  hand-written allowlist sanitizer.
- `document.execCommand` is deprecated but still works in all major browsers
  for bold/italic/underline/link/lists, and is acceptable here. Normalize its
  output (e.g. `<b>` to `<strong>`, `<div>` to `<p>`) in the sanitizer rather
  than fighting it during editing.

### 5.4 Storage format and sanitization

- Rich text is stored as an HTML string limited to this allowlist:
  `p, br, strong, em, u, a[href], ul, ol, li`.
- On sanitize: `b` becomes `strong`, `i` becomes `em`, `div` becomes `p`.
  Any other element is unwrapped (its text kept). Elements whose content must
  never become text (`script`, `style`, `iframe`, `object`) are removed
  entirely. All attributes are dropped except `href` on `a`, which must pass
  the scheme check or the link is unwrapped.
- The same sanitizer runs on paste, on load from file, on restore from
  browser storage, and before every save.
- Implementation: parse with `DOMParser` or an inert `<template>`, walk the
  tree, build clean output. Never assign untrusted HTML to a live element's
  `innerHTML` before sanitizing it.
- Rationale: a JSON file could be hand-edited or received from someone else.
  Loading it must never execute script (`<img onerror>`, `javascript:` links,
  etc.).

## 6. Persistence

There are two layers:

1. **Working copy in browser storage** (automatic, crash/close safety net).
2. **JSON file** (explicit Download and Open; the durable, portable copy).

### 6.1 JSON file format

```json
{
  "format": "meddpicc-editor",
  "version": 1,
  "title": "Acme Corp - Q1 Renewal",
  "updated_at": "2026-11-06T15:30:00Z",
  "next_steps": { "content": "<ul><li>Schedule CFO meeting</li></ul>" },
  "sections": {
    "metrics":           { "status": "green",  "content": "<p>Reduce churn by <strong>15%</strong></p>" },
    "economic_buyer":    { "status": "yellow", "content": "<p>Likely the CFO, <a href=\"https://www.linkedin.com/in/example\">Jane Doe</a></p>" },
    "champion":          { "status": "blue",   "content": "" },
    "identify_pain":     { "status": "red",    "content": "<p>Security review not yet started</p>" },
    "decision_criteria": { "status": "white",  "content": "" },
    "decision_process":  { "status": "white",  "content": "" },
    "paper_process":     { "status": "gray",   "content": "" },
    "competition":       { "status": "white",  "content": "" }
  }
}
```

Rules:

- `format` and `version` are required; they allow future migrations.
- `sections` is an object keyed by section key. Key order in the file has no
  meaning; display order comes only from the section config.
- `updated_at` is ISO 8601 UTC, set on every download.
- Pretty-printed with 2-space indent, UTF-8, so files are diffable.

### 6.2 Download (save)

- A single **Download** button (and Cmd/Ctrl+S) serializes the document and
  triggers a browser download via a Blob URL, using the filename from 2.3.
- The browser decides where the file goes (usually Downloads) and may append
  `(1)`, `(2)` to repeated downloads. This is accepted for now.
- No File System Access API, no save-in-place.

### 6.3 Open (load)

- **Open...** uses `<input type="file" accept=".json,application/json">`.
- Drag-and-drop of a JSON file onto the page is a nice-to-have.
- Loading rules:
  - Missing section, `status`, or `content` falls back to defaults
    (`"white"`, `""`). Load does not fail.
  - Unknown `status` value loads as `"white"` with a non-blocking warning.
  - Unknown extra keys are ignored and not preserved on the next download.
  - `version` greater than supported: warn, attempt best-effort load.
  - Invalid JSON or wrong `format`: show an error and leave the current
    document untouched.
  - All `content` passes through the sanitizer.
- A successfully opened file replaces the working copy (6.4).

### 6.4 Working copy in browser storage

Goal: if the tab is closed or the browser crashes, reopening the same page
address shows the content exactly as it was.

- Store the full document (same shape as the JSON file) in `localStorage`
  under one key, e.g. `meddpicc-editor:working-copy`.
- Write on every change, debounced (~500 ms), and on `visibilitychange` /
  `pagehide` to catch closes.
- On page load: if a working copy exists, restore it automatically (sanitized,
  same loading rules as 6.3). No prompt.
- There is exactly one working copy. Opening a file or pressing **New**
  replaces it.
- Status indicator in the header:
  - "Saved in browser" once the working copy is written.
  - "Not downloaded since last change" when edits exist that are not in a
    downloaded file. This flag is also persisted, so it survives reloads.
- **New** and **Open** ask for confirmation only when there are changes not yet
  downloaded, since the working copy is about to be replaced.
- No `beforeunload` prompt: closing the tab is safe because of the working
  copy. (See Q3.)
- If `localStorage` is unavailable or full, show a persistent warning that the
  safety net is off and the user should download regularly.

## 7. Technical approach

- Plain HTML, CSS, and JavaScript. **No dependencies, no build step, no
  backend.**
- Must work when `index.html` is opened directly from disk (`file://`). This
  rules out ES modules (`<script type="module">` is blocked on `file://` in
  Chrome). Use classic `<script>` tags that share one global namespace object
  (e.g. `window.Meddpicc`), loaded in dependency order.
- Works fully offline. No CDN or network calls.
- Target browsers: current Chrome, Edge, Firefox, Safari.
- Directory layout:

```
meddpicc/
  app/
    index.html
    styles.css
    print.css
    js/
      config.js        # sections (order, groups) and statuses: single source of truth
      sanitize.js      # allowlist sanitizer
      editor.js        # contenteditable setup, shared toolbar, links, paste
      document.js      # in-memory model, serialize/deserialize/validate
      persistence.js   # download, open, localStorage working copy
      main.js          # wiring, header status indicator
  tests/
    tests.html         # dependency-free in-browser unit tests
  examples/
    sample.json        # committed example document
  specs/
  README.md
```

Note: `.gitignore` ignores `*.meddpicc.json` and `/data/` as user data, which
is why the example is named `sample.json`.

## 8. Print stylesheet

`print.css` (via `<link media="print">`) makes Cmd/Ctrl+P produce a clean
document suitable for "Save as PDF":

- Hide the toolbar, header buttons, color pickers, and status indicator.
- Show the title, Next Steps, all eight boxes in display order, and the
  separator.
- Keep status colors (`print-color-adjust: exact`) and print each status's
  text label next to the heading so meaning survives black-and-white printing.
- Single-column or two-column layout, whichever fits better on Letter/A4;
  avoid breaking a box across pages (`break-inside: avoid`).
- Links print with their URL after the text, e.g. "Jane Doe (https://...)".
- Empty placeholder prompts do not print.

## 9. Testing

- **Unit tests** in `tests/tests.html`, a dependency-free page with a tiny
  assert helper that shows pass/fail when opened in a browser:
  - Sanitizer: removes `<script>`, `<style>`, event handler attributes,
    `style` attributes, and `javascript:` hrefs; normalizes `b`/`i`/`div`;
    keeps allowlisted tags and safe links.
  - Serialize then deserialize is lossless.
  - Loading with missing or unknown fields falls back correctly.
  - Filename derivation from title.
- **Manual test checklist** in the README:
  - Type in every box, apply each format, add a link, set every color.
  - Close the tab, reopen the same address, confirm everything is restored.
  - Download, press New, Open the downloaded file, confirm exact match.
  - Open an invalid file; confirm error and that content is untouched.
  - Open a malicious file (script tags, `onerror`, `javascript:` links);
    confirm nothing executes.
  - Paste from Google Docs and Word; confirm formatting is reduced.
  - Print preview looks correct.
  - Repeat the restore test in each target browser, from `file://`.

## 10. Acceptance criteria

1. Page shows, top to bottom: title, Next Steps, the priority group (Metrics,
   Economic Buyer, Champion, Identify Pain), a visible separator, then
   Decision Criteria, Decision Process, Paper Process, Competition.
2. Each framework box has a picker with exactly White, Red, Yellow, Green,
   Blue, Gray; defaults to White; the box visibly reflects the selection, and
   non-white selections show their label.
3. Next Steps and every framework box support bold, italic, underline, links,
   and lists; pasted content is reduced to that subset; Cmd/Ctrl+click opens
   links.
4. Download produces a JSON file matching 6.1; opening it restores title, all
   text with formatting and links, and all colors exactly.
5. Closing and reopening the tab at the same address restores all content and
   colors without any action from the user.
6. Opening a malicious file executes nothing.
7. The app runs offline from `file://` with no dependencies and no build step.
8. Print preview produces a clean, readable document with status labels.

## 11. Open questions

Resolved during review (kept for the record): color categories (Section 4),
download-only save plus browser working copy (6.2, 6.4), no Python (7),
"Identify Pain" heading, rich text scope (5.1), Cmd/Ctrl+click for links,
Next Steps has no color, one opportunity per file, no per-box metadata,
sanitized HTML storage, print stylesheet (8), 2-column grid, tint plus left
border.

Still open, each with the assumption this spec makes:

- **Q1. Separator appearance.** Plain rule with spacing, or labeled groups
  (e.g. "Priority" above the top four)? *Assumption:* plain rule, no labels.
- **Q2. Picker order.** *Assumption:* White, Red, Yellow, Green, Blue, Gray, as
  listed in Section 4. An alternative is a risk scale: Red, Yellow, Blue,
  Green, then Gray and White.
- **Q3. Close-tab warning.** With the working copy, closing is safe, so there
  is no `beforeunload` prompt. Some users may still want a reminder to
  download. *Assumption:* no prompt.
- **Q4. `file://` storage in Safari.** Safari's handling of `localStorage` for
  local files is less reliable than Chrome or Firefox, and Chrome shares one
  storage area across all `file://` pages. If restore fails in Safari, the
  options are to document Chrome/Firefox as preferred, or to serve the folder
  locally (e.g. `python3 -m http.server`), which reintroduces a tool.
  *Assumption:* test early; document any browser limitation in the README.
- **Q5. Working copy scope.** One working copy per browser means two tabs of
  the app overwrite each other. *Assumption:* acceptable for a single-user
  tool; optionally warn if another tab is detected via the `storage` event.
- **Q6. Gray boxes.** Should "presently irrelevant" boxes also be visually
  de-emphasized (dimmed text) or collapsible? *Assumption:* tint only.

## 12. Future areas for growth

Not in scope now; recorded so the no-dependency design does not block them.

- **Editor library** (Tiptap, Quill, or Lexical, vendored as a single file) if
  `contenteditable` edge cases around lists and paste become painful.
- **DOMPurify** in place of the hand-written sanitizer, for a vetted allowlist.
- **Save-in-place** via the File System Access API (Chrome/Edge) so Save
  overwrites the same file instead of downloading copies.
- **Local Python server** for consistent saving to a fixed folder across
  browsers, if needed.
- **Automated end-to-end tests** with Playwright.
- **Next Steps as a checklist** with owners and due dates.

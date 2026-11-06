# MEDDPICC Editor

A local, single-user editor for qualifying a sales opportunity with the
MEDDPICC framework. It runs entirely in your browser from files on disk. There
is no server, no account, and no dependencies.

The full specification is in [specs/meddpicc-editor.md](specs/meddpicc-editor.md).

## Running it

Open `app/index.html` in a current version of Chrome, Edge, Firefox, or Safari.
Double-clicking the file works. Nothing needs to be installed or built.

## Using it

- **Title** at the top names the opportunity. It also becomes the download
  filename.
- **Next Steps** sits directly under the title.
- **The four priority boxes** come first: Metrics, Economic Buyer, Champion,
  and Identify Pain. A separator divides them from Decision Criteria, Decision
  Process, Paper Process, and Competition.
- **Status colors** are set with the swatches in each box header:

  | Color  | Meaning                           |
  |--------|-----------------------------------|
  | White  | Default, no description           |
  | Red    | Risky and presently important     |
  | Yellow | Risky, not presently as important |
  | Green  | Excellent                         |
  | Blue   | Okay                              |
  | Gray   | Presently irrelevant              |

  The letter chips in the top bar show every box's status at a glance. Click
  one to jump to that box.
- **Formatting** uses the toolbar or keyboard shortcuts. Bold, italic,
  underline, links, bulleted lists, and numbered lists are supported. Pasted
  text keeps only those formats.

  | Action    | Mac   | Windows / Linux |
  |-----------|-------|-----------------|
  | Bold      | ⌘B    | Ctrl+B          |
  | Italic    | ⌘I    | Ctrl+I          |
  | Underline | ⌘U    | Ctrl+U          |
  | Link      | ⌘K    | Ctrl+K          |
  | Download  | ⌘S    | Ctrl+S          |

- **Links** open with ⌘+click (Ctrl+click on Windows and Linux). A plain
  click places the cursor so you can edit the link text. To change or remove a
  link, put the cursor in it and press the link button.

## Saving and opening

- **Download** saves the whole document as a JSON file through your browser's
  normal download, usually into your Downloads folder. Repeated downloads may
  get names like `Deal (1).json`.
- **Open…** loads a JSON file you downloaded earlier. You can also drag a file
  onto the page.
- **New** starts a blank document.
- **Working copy:** every change is also kept in this browser automatically.
  If you close the tab or the browser crashes, open the same `index.html` again
  and your work is restored. The top bar shows "Not downloaded since last
  change" until you download.

The browser copy is a safety net, not a backup. It lives only in this browser
on this computer, and clearing site data removes it. Download to keep a
durable copy.

### Browser notes

- Chrome and Edge share one storage area across all pages opened from disk.
  If you open two copies of the editor, they share one working copy.
- Safari can be less reliable at keeping storage for pages opened from disk.
  If your work does not come back after reopening in Safari, use Chrome or
  Firefox, or download more often.
- If storage is blocked entirely, a red banner says so. Everything else still
  works, but closing the tab loses unsaved work.

## Printing

Use the browser's Print command, or Save as PDF. Buttons, toolbars, and color
pickers are hidden. Box colors print along with their text labels, and link
addresses print after the link text.

## File format

```json
{
  "format": "meddpicc-editor",
  "version": 1,
  "title": "Acme Corp - Q1 Renewal",
  "updated_at": "2026-11-06T15:30:00Z",
  "next_steps": { "content": "<ul><li>Schedule CFO meeting</li></ul>" },
  "sections": {
    "metrics": { "status": "green", "content": "<p>Reduce churn by <strong>15%</strong></p>" }
  }
}
```

The `sections` object holds all eight keys: `metrics`, `economic_buyer`,
`champion`, `identify_pain`, `decision_criteria`, `decision_process`,
`paper_process`, and `competition`. Rich text is stored as HTML limited to
`p`, `br`, `strong`, `em`, `u`, `a`, `ul`, `ol`, and `li`. Everything else is
stripped when a file is loaded, so a hand-edited or shared file cannot run
code. A full example is in [examples/sample.json](examples/sample.json).

## Project layout

```
app/
  index.html        page shell
  styles.css        screen styles
  print.css         print styles
  js/
    config.js       sections, display order, and status colors (single source of truth)
    sanitize.js     allowlist HTML sanitizer and link checking
    document.js     JSON document model: create, validate, serialize
    persistence.js  download, open, and the browser working copy
    editor.js       rich text editing, toolbar, links, paste
    main.js         page assembly and wiring
tests/
  tests.html        unit tests, open in a browser
  tests.js
examples/
  sample.json       example document
specs/
  meddpicc-editor.md
```

To change box order, headings, prompts, status colors, or status labels, edit
`app/js/config.js` only.

## Tests

Open `tests/tests.html` in a browser. It runs the unit tests and lists each
result. The page title shows `PASS n/n` or `FAIL x/n`.

To run them headless with Chrome on macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --virtual-time-budget=3000 --dump-dom \
  "file://$PWD/tests/tests.html" | grep -o '<title>[^<]*</title>'
```

### Manual test checklist

Run through this in each target browser, with the page opened from disk.

1. Type in the title, Next Steps, and every box.
2. Apply bold, italic, underline, both list types, and a link in at least one box.
3. Set every status color at least once, including back to White. Check that
   the box tint, the label, and the summary chip all update.
4. Close the tab, reopen `app/index.html`, and confirm everything is restored.
5. Download. Press New, confirm the warning only appears when there are
   changes that haven't been downloaded, then Open the downloaded file. Confirm
   that everything matches exactly.
6. Open an invalid file, such as any non-JSON file. Confirm an error appears and
   the current content is untouched.
7. Open a malicious file containing script tags, `onerror` attributes, and
   `javascript:` links. Confirm nothing runs and the links are gone.
8. Paste from Google Docs and from Word. Confirm only bold, italic,
   underline, links, and lists survive.
9. ⌘/Ctrl+click a link and confirm it opens in a new tab. A plain click
   should only place the cursor.
10. Open print preview and confirm the layout is clean and status labels show.

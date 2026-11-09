# MEDDPICC Editor: Hosting Specification

Status: Draft v0.1 (2026-11-06). Companion to
[meddpicc-editor.md](meddpicc-editor.md), whose "no hosting" non-goal this
document relaxes. Nothing here changes what the editor does.

## 1. Summary

The editor is already a static website: one HTML page, two stylesheets, and six
script files, with no server code, no build step, and no network calls.
Putting it online means copying the `app/` folder to a static host. The code
needs no functional changes.

The real work is configuration and a few decisions:

1. Pick a host that gives the editor **its own origin** (Section 5), because
   the browser working copy is stored per origin.
2. Add a **Content Security Policy** and a few response headers as defense in
   depth (Section 6).
3. Decide on access, indexing, and who controls deployment (Section 11).
4. Update the README for hosted use.

Estimated effort: about half a day including cross-browser checks
(Section 10).

### Scope

- The hosted site serves the same files. Users still Download and Open JSON
  files on their own computer, and the working copy still lives only in their
  browser.
- No new features: no accounts, no server storage, no sync, no analytics, no
  offline/PWA support.
- Opening `app/index.html` from disk must keep working exactly as today.

## 2. What stays the same

| Area | Hosted behavior |
|---|---|
| Download | Same browser download of a JSON file. |
| Open, drag-and-drop open | Same. Files are read locally; nothing is uploaded. |
| Working copy | Same mechanism (`localStorage`), different storage location (Section 4). |
| Rich text, paste, links, print | Same. |
| File format | Same. Files move freely between the local and hosted copies. |
| Code structure | Same. Keep classic `<script>` tags (no ES modules) so local use keeps working. |

Verified on 2026-11-06 in headless Chrome: the app served over HTTP from a
local web server passed the full 54-step end-to-end check (typing, formatting,
colors, links, paste, restore after reload, download, open, malicious files,
New/Open warnings). The same check passed from disk with the proposed policy
in place. Firefox, Safari, and Edge were not tested.

## 3. What gets deployed

- Deploy **only the `app/` folder** as the site root, so the editor loads at
  `https://<host>/`.
- Do not deploy `tests/`, `specs/`, `examples/`, or `README.md`.
- No build command. The publish directory is `app`.

## 4. Behavior differences: opened from disk vs hosted

| Topic | Opened from disk (`file://`) | Hosted (`https://`) |
|---|---|---|
| Where the working copy lives | Browser storage for local files. Chrome shares one store across all local files. | Browser storage for that one site origin. |
| Local and hosted copies | Separate working copies. Neither sees the other. | Move work between them with Download and Open. |
| Safari | Storage for local files is unreliable. | Normal storage, but see the 7-day rule below. |
| Offline | Always works. | Needs a connection to load the page. Once loaded, it works offline until reloaded. |
| Updates | User replaces the files. | Everyone gets the new version on their next page load. |
| Two tabs | Share one working copy (warning shown). | Same. |

**Safari 7-day rule.** Safari deletes script-writable storage, including
`localStorage`, for a website that has had no user interaction in the last
7 days of Safari use. Each visit resets the clock. A working copy left
untouched for more than a week of browsing can disappear. Downloaded files
are unaffected. This is acceptable because the working copy is only a safety
net. The README must say so (Section 6.4).

**Storage eviction elsewhere.** Chrome, Edge, and Firefox treat this storage
as "best effort" and may clear it under severe disk pressure. Rare, same
mitigation: download.

## 5. Hosting options

The key requirement is a **dedicated origin**. Browser storage is shared by
every page on the same origin (scheme, host, and port). Any script on that
origin can read the working copy.

| Host | Own origin by default | Custom headers | Notes |
|---|---|---|---|
| Cloudflare Pages | Yes, `<project>.pages.dev` | Yes, `_headers` file | Free tier. Atomic deploys. |
| Netlify | Yes, `<site>.netlify.app` | Yes, `_headers` file | Free tier. Atomic deploys. Optional password protection on paid plans. |
| GitHub Pages | **No** for project sites | No | `<user>.github.io/meddpicc` shares the `<user>.github.io` origin with every other Pages site of that account. Acceptable only with a custom domain. Fixed 10-minute cache. |
| Company web server or S3 + CloudFront | Yes, on its own hostname | Yes | More setup; makes sense if the company already runs one. |

**Recommendation:** Cloudflare Pages or Netlify, publishing `app/`, on the
provider subdomain at first and a custom subdomain later if wanted (e.g.
`meddpicc.<company-domain>`). Both read the same `_headers` format, so the
repo stays host-neutral between them.

**Prerequisite:** the repo has no remote yet. Both hosts deploy from a Git
provider (GitHub, GitLab, Bitbucket), so the first step is pushing to a
remote. A private repository is fine.

## 6. Required repo changes

All changes are configuration or documentation. None changes app behavior.

### 6.1 Content Security Policy in `index.html`

Add as the first element after `<meta charset>`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'">
```

- A `<meta>` policy works on every host, including ones without header
  control, and also applies when the page is opened from disk.
- `connect-src 'none'` blocks fetch, XHR, WebSocket, and beacons. The page has
  no reason to talk to any server, so this also enforces the privacy claim in
  Section 8.
- `img-src 'self'` blocks image-based beacons to other sites.
- The app's own code is compatible: it has no inline scripts, no inline
  `style` attributes in markup, and sets styles only through the CSSOM
  (`element.style.setProperty`), which the policy allows.

**Known console noise.** When pasted or opened content contains inline
`style` attributes or event-handler attributes (`onclick`, `onerror`), the
sanitizer's inert parse of that content makes the browser report a policy
violation. The attribute is blocked, which is the desired outcome, and the
sanitized output is identical. Pasting from Google Docs or Word will therefore
log console messages. Accept this. Do not add `'unsafe-inline'` to silence
it. Do not add a `report-uri` or `report-to` directive, since that would send
data to a server.

### 6.2 `app/_headers` (Cloudflare Pages and Netlify)

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cache-Control: no-cache
  X-Robots-Tag: noindex
```

- `frame-ancestors 'none'` stops other sites from embedding the editor in a
  frame. It only works as a header, not in `<meta>`.
- `Cache-Control: no-cache` makes browsers revalidate on every load, so a
  deploy reaches users immediately and HTML and scripts never mix versions
  across a release. The files are tiny, so the cost is negligible.
- `X-Robots-Tag: noindex` keeps the site out of search results. Remove it if
  the site should be discoverable (Q3).
- The file is ignored when the app is opened from disk.

On hosts without header support (GitHub Pages), the `<meta>` policy from 6.1
still applies; `frame-ancestors`, `nosniff`, and the cache header do not.

### 6.3 Favicon (optional)

Browsers request `/favicon.ico` on every load. Without one, the host logs a
404 on every visit. Add a small `app/favicon.svg` and
`<link rel="icon" href="favicon.svg">`. This is allowed by `img-src 'self'`.

### 6.4 README

Add a "Using the hosted version" section covering:

- The URL.
- Your documents never leave your computer; the site only serves the editor.
- The hosted and local copies keep separate working copies. Move work with
  Download and Open.
- Safari's 7-day rule (Section 4), and that downloads are the durable copy.
- The editor updates automatically. Old files keep opening (Section 7).

## 7. Updates and compatibility

- Every deploy updates all users on their next load. There are no stale
  clients to support beyond one open tab, which keeps working until reloaded.
- **Never ship a change that cannot read older files.** The `format`/`version`
  fields already support this. If the file format must change, bump `version`
  and keep reading older versions.
- On load, the new code re-validates the existing working copy through the
  same rules used for opening files, so a format change cannot corrupt it.
- A file saved by a newer hosted version can still be opened in an older local
  copy, with the existing "newer version" warning.
- Deploy only from the main branch, after the unit tests pass locally
  (Section 9).

## 8. Security and privacy

### What is at risk

There is no server-side data. The assets are what users type and the working
copy stored in their browser.

| Threat | Mitigation |
|---|---|
| Malicious file or paste injects script | Existing allowlist sanitizer (primary). CSP blocks inline script and event handlers (secondary). |
| Injected script exfiltrates data | `connect-src 'none'` and `img-src 'self'` block fetch, XHR, beacons, and image pings. CSP cannot block a top-level navigation, so the sanitizer remains the primary defense. |
| Another app on the same origin reads the working copy | Dedicated origin (Section 5). |
| Someone with deploy access ships malicious code | They could also change the CSP, so CSP does not help here. Require 2FA on the Git provider and host accounts, limit deploy access, and protect the main branch. |
| Clickjacking | `frame-ancestors 'none'` header. Low impact anyway. |
| Third-party code | None today. Keep it that way: no CDNs, analytics, fonts, or tag managers. |

### Privacy

- The site never receives document content. The page makes no network
  requests after loading, and the CSP enforces that.
- The host keeps standard request logs (IP address, user agent, time).
- No cookies. The only storage is the working copy, which is strictly
  functional. A cookie-consent banner is very likely unnecessary. Confirm with
  whoever owns compliance; this spec is not legal advice.

### Access

The site holds no data, so making it public exposes nothing beyond the editor
itself. If it should be limited to employees anyway, put host-level access
control in front of it, such as Cloudflare Access, Netlify password
protection, or an internal server behind SSO. No app changes are needed.

## 9. Deployment steps

1. Push the repository to a new remote.
2. Make the repo changes in Section 6 and run `tests/tests.html` locally.
3. Create the host project: connect the repo, set the publish directory to
   `app`, leave the build command empty, and deploy from `main`.
4. Optional: attach a custom subdomain. HTTPS certificates are automatic on
   both recommended hosts. Confirm HTTP redirects to HTTPS.
5. Run the acceptance checks below against the live URL.
6. Add the URL to the README.

## 10. Effort estimate

| Task | Estimate |
|---|---|
| Create remote, push, connect host | 30 min |
| CSP meta tag, `_headers`, favicon | 30 min |
| README section | 30 min |
| Acceptance checks in Chrome, Firefox, Safari, Edge | 1 to 2 hours |
| Custom domain and DNS (optional) | 30 min plus DNS propagation |
| **Total** | **About half a day** |

## 11. Acceptance criteria

1. `https://<host>/` loads the editor. HTTP redirects to HTTPS.
2. `/tests/`, `/specs/`, and `/examples/` return 404.
3. Response headers from 6.2 are present:
   ```sh
   curl -sI https://<host>/ | grep -iE 'content-security-policy|x-content-type|referrer-policy|cache-control|x-robots'
   ```
4. The manual checklist in the README passes on the hosted URL in Chrome,
   Firefox, Safari, and Edge. That covers typing, formatting, colors, links,
   restore after closing the tab, Download, Open, malicious files, paste, and
   print.
5. Normal use with clean content (typing, toolbar, links, statuses, Download,
   Open of a clean file, print) logs no CSP violations in the console. The
   only reports allowed are from pasting or opening content that contains
   inline styles or handlers (6.1).
6. The browser's network panel shows no requests after the initial page load,
   other than the favicon.
7. Opening `app/index.html` from disk still passes the same checklist.
8. A file downloaded from the hosted version opens in the local version, and
   the reverse.

## 12. Open questions

Each lists the assumption this spec makes.

- **Q1. Host.** *Assumption:* Cloudflare Pages or Netlify. GitHub Pages only
  with a custom domain.
- **Q2. Domain.** *Assumption:* the provider subdomain to start. A company
  subdomain can be added later. Changing the domain changes the origin, so
  users' working copies would not carry over. Tell users to download first.
- **Q3. Public or restricted, indexed or not.** *Assumption:* public URL, not
  indexed (`noindex`), no host-level login.
- **Q4. Git hosting.** *Assumption:* a private GitHub repository.
- **Q5. Ownership.** Who owns the host account, the domain, and deploy rights?
  *Assumption:* the requester, with 2FA on all accounts.
- **Q6. Safari 7-day rule.** *Assumption:* acceptable with a README note.
- **Q7. Sample file.** Should `examples/sample.json` be downloadable from the
  site? *Assumption:* no. Serving it would mean deploying more than `app/`.

## 13. Out of scope, possible later

- **Offline use and install** via a service worker and web app manifest, so
  the hosted version loads without a connection.
- **Persistent storage request** (`navigator.storage.persist()`) to reduce
  eviction risk, including Safari's 7-day rule where the browser honors it.
- **Save in place** with the File System Access API in Chrome and Edge, as
  already listed in the editor spec's future section.
- **Automated tests in CI** running the unit tests in headless Chrome before
  each deploy.

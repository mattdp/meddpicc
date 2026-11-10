# MEDDPICC Editor: Hosting Inside the Rails Site

Status: Draft v0.2 (2026-11-10). Replaces v0.1, which considered a standalone
static host. Companion to [meddpicc-editor.md](meddpicc-editor.md), whose
"no hosting" non-goal this document relaxes. Nothing here changes what the
editor does.

## 1. Summary

The editor becomes part of an existing Ruby on Rails site. The Rails app serves
the editor's static files and nothing else. All document storage stays in the
user's browser and in JSON files on their computer.

How:

- Copy the editor's `app/` folder into the Rails repo at `vendor/meddpicc/`.
- A small Rack middleware (about 60 lines, Section 5.2) answers editor requests
  **before** Rails' sessions, routing, controllers, and ActiveRecord. Those
  requests never reach application code, so there is no code path to the
  database.
- Serve it on a **dedicated subdomain**, such as `meddpicc.<your-domain>`
  (recommended), or under a path such as `/meddpicc/` on the main site
  (simpler, weaker isolation). Section 4 compares them.
- No routes, controllers, views, models, migrations, jobs, or gems are added.

Estimated effort: about one day for the subdomain design, half a day for the
path design (Section 12).

### What was verified

On 2026-11-10, in a throwaway Rails 7.1.3 app (production middleware stack,
`force_ssl` on):

| Check | Result |
|---|---|
| Integration tests for the subdomain design: the Section 5.4 tests plus a control test and a content-type test | 8 of 8 pass |
| Unit tests for the path design | 5 of 5 pass |
| Editor requests run zero SQL queries | Confirmed. A control route on the main host does query, which proves the query counter works. |
| App routes are unreachable on the editor host; writes get 405 | Confirmed, with zero queries |
| Path traversal out of `vendor/meddpicc` | Blocked |
| Middleware position | After `ActionDispatch::SSL`, before `Rack::Sendfile`, `ActionDispatch::Static`, logging, sessions, and routing |
| Sync script (Section 5.5) | Produces a copy identical to the committed `app/` |

Earlier, on 2026-11-06, the editor itself passed its 54-step end-to-end check
when served over HTTP with the content security policy in place, and when
opened from disk. All checks used Chrome only. The real Rails site was not
available, so Section 13 lists what to check there.

### Scope

- Same editor, same files, same behavior. Users still Download and Open JSON
  files on their own computer, and the working copy lives only in their
  browser.
- No integration with the site's layout, navigation, login, or JavaScript.
- No server-side storage of any kind, and no ability to reach the database.
- Opening `app/index.html` from disk keeps working exactly as today.

## 2. The no-database guarantee

The requirement is that the editor cannot touch the database, now or by
accident later. It rests on six layers, any one of which would stop a
regression on its own.

| # | Layer | Mechanism |
|---|---|---|
| 1 | No application code runs | The middleware answers editor requests before `ActionDispatch::Executor`, cookies, sessions, `Rails::Rack::Logger`, and routing. No ActiveRecord connection is checked out. |
| 2 | The editor host is closed | On the editor host, every request is a file, a 404, or a 405 for anything other than GET or HEAD. Nothing on that host is ever passed to the Rails app. |
| 3 | The page cannot send data | The policy `connect-src 'none'` blocks fetch, XHR, WebSockets, and beacons, and `form-action 'none'` blocks form posts. The page makes no requests after loading. |
| 4 | Browser isolation | On its own subdomain the editor is a separate origin. Its scripts cannot read the main site's pages or storage, or script them through `window.open`. |
| 5 | Automated test | A Rails integration test fails if any editor request runs SQL (Section 5.4). |
| 6 | Review gate | `CODEOWNERS` entries on `vendor/meddpicc/`, the middleware, and its test. Rule: never add a route, controller, or `connect-src` for the editor. |

Any future feature that needs server storage is a new spec, not a change to
this one.

## 3. Why not render it through a Rails controller

A controller action that renders the editor inside the site layout looks
natural but breaks the requirement and the editor:

- `ApplicationController` filters typically load the session and
  `current_user`, which queries the database on every page view.
- The site layout brings in the site's JavaScript (Turbo, analytics, chat
  widgets), which then runs next to the editor and can read its working copy.
- Site CSS collides with editor CSS.
- The asset pipeline (Sprockets, Propshaft, importmap, jsbundling) would
  rename or rewrite the files. They must stay plain so the same files work
  from disk.

The editor stays a standalone page. A plain link from the site's navigation
to the editor is fine.

## 4. Design options

### 4.1 Comparison

| Topic | A. Dedicated subdomain (recommended) | B. Path on the main host |
|---|---|---|
| URL | `https://meddpicc.<your-domain>/` | `https://www.<your-domain>/meddpicc/` |
| Origin | Separate from the main site | Same as the main site |
| Who can read the working copy | Only the editor | Every script on the main site, including third-party analytics, chat, or tag-manager scripts, and any cross-site scripting bug anywhere on the site |
| If the editor were ever compromised | Limited to editor data | Could act as the signed-in user on the main site, by opening a same-origin window and scripting it |
| Turbo | Not involved, since cross-origin links are never Turbo visits | Links into the editor must opt out of Turbo |
| Extra infrastructure | DNS record, TLS certificate for the subdomain, host allowlist | None |
| Effort | About one day | About half a day |

**Recommendation: A.** Deal notes are sensitive, and a separate origin is the
only boundary that keeps every other script on the site away from them.
Choose B only if the main site loads no third-party scripts and adding a
subdomain is impractical.

### 4.2 Cookies and the subdomain

A subdomain is a different origin but the same *site*, so a few cookie details
matter:

- **Keep the session cookie host-only.** Rails' cookie store is host-only by
  default. If the app sets `domain: :all` or `.your-domain`, the browser sends
  that cookie to the editor host. The editor ignores it, but any cookie that
  is scoped to the parent domain and not `HttpOnly` becomes readable by the
  editor's scripts.
- `SameSite=Lax` cookies are sent on same-site requests. That is harmless
  here: the editor's policy blocks all requests, and Rails' CSRF tokens
  protect writes on the main site.

## 5. Rails repo changes (both designs)

### 5.1 Files

| Path | Purpose |
|---|---|
| `vendor/meddpicc/` | Copy of the editor's `app/` folder at a tagged release (Section 5.5). Deliberately **not** under `public/`, so `ActionDispatch::Static` or the web server's public root never serves it on the main host, and it bypasses the asset pipeline. |
| `lib/meddpicc_editor_server.rb` | The middleware (5.2). |
| `config/application.rb` | Require the middleware and insert it (5.3). |
| `test/integration/meddpicc_editor_test.rb` | The no-database and routing tests (5.4). Port to RSpec if the app uses it. |
| `bin/meddpicc-sync` | Copies a tagged editor release into `vendor/meddpicc/` (5.5). |
| `.github/CODEOWNERS` | Review gate for the paths above. |

### 5.2 Middleware

Tested as written on Rails 7.1.3 with Rack 3.0.

```ruby
# lib/meddpicc_editor_server.rb
# frozen_string_literal: true

require "rack/files"

# Serves the MEDDPICC editor's static files from vendor/meddpicc.
#
# Requests it owns never reach the Rails app: no routing, no controllers,
# no session, no ActiveRecord. Everything else passes through untouched.
#
#   Dedicated host:  host: "meddpicc.example.com"            (whole host is the editor)
#   Path on a host:  host: "www.example.com", prefix: "/meddpicc"
class MeddpiccEditorServer
  CSP = [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'",
    "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
    "frame-ancestors 'none'"
  ].join("; ").freeze

  HEADERS = {
    "content-security-policy" => CSP,
    "x-content-type-options" => "nosniff",
    "referrer-policy" => "no-referrer",
    "permissions-policy" => "camera=(), microphone=(), geolocation=(), payment=()",
    "cache-control" => "no-cache",
    "x-robots-tag" => "noindex"
  }.freeze

  def initialize(app, root:, host:, prefix: "")
    @app = app
    @host = host
    @prefix = prefix.chomp("/")
    @files = Rack::Files.new(root.to_s, HEADERS)
  end

  def call(env)
    request = Rack::Request.new(env)
    return @app.call(env) unless owns?(request)
    return method_not_allowed unless request.get? || request.head?

    path = request.path_info.delete_prefix(@prefix)
    return redirect_to_slash if path.empty? # relative URLs in index.html need the trailing slash

    path = "/index.html" if path == "/"
    @files.call(env.merge(Rack::PATH_INFO => path, Rack::SCRIPT_NAME => ""))
  end

  private

  def owns?(request)
    return false unless request.host == @host
    return true if @prefix.empty?

    request.path_info == @prefix || request.path_info.start_with?("#{@prefix}/")
  end

  def method_not_allowed
    [405, { "allow" => "GET, HEAD", "content-type" => "text/plain" }, ["Method Not Allowed\n"]]
  end

  def redirect_to_slash
    [301, { "location" => "#{@prefix}/", "content-type" => "text/plain" }, []]
  end
end
```

Notes:

- `Rack::Files` handles content types, `Last-Modified` revalidation (which
  `no-cache` relies on), byte ranges, and rejects `..` path traversal.
- On Rack 2 (Rails 6.x and earlier 7.0 apps), header names are case-insensitive,
  so the lowercase names still work. Retest there.
- The middleware references no Rails or ActiveRecord constants.

### 5.3 Configuration

```ruby
# config/application.rb
require_relative "../lib/meddpicc_editor_server"   # after Bundler.require

module YourApp
  class Application < Rails::Application
    # ...
    config.middleware.insert_before Rack::Sendfile, MeddpiccEditorServer,
      root: config.root.join("vendor/meddpicc"),
      host: ENV.fetch("MEDDPICC_HOST", "meddpicc.example.com")
      # Design B instead: host: ENV.fetch("APP_HOST"), prefix: "/meddpicc"
  end
end
```

- Require the file explicitly rather than relying on autoloading. Middleware
  is built at boot, before Zeitwerk can reload it.
- `insert_before Rack::Sendfile` puts it after `ActionDispatch::SSL`, so
  `force_ssl` still redirects HTTP to HTTPS and sends HSTS for editor
  requests.
- If the app sets `config.hosts`, `ActionDispatch::HostAuthorization` runs
  first. Add the editor host there, or requests are blocked.
- Run `bin/rails middleware` in each environment and confirm nothing that
  touches the database sits **above** `MeddpiccEditorServer`. Examples to look
  for are multi-tenancy middleware and custom auth middleware. Error trackers
  and rate limiters above it are fine if they don't query the database.

### 5.4 Integration test

```ruby
# test/integration/meddpicc_editor_test.rb
require "test_helper"

class MeddpiccEditorTest < ActionDispatch::IntegrationTest
  EDITOR_HOST = "meddpicc.example.com"   # match MEDDPICC_HOST in the test env
  MAIN_HOST = "www.example.com"

  def queries_during
    queries = []
    callback = ->(_name, _start, _finish, _id, payload) { queries << payload[:sql] }
    ActiveSupport::Notifications.subscribed(callback, "sql.active_record") { yield }
    queries
  end

  test "editor host serves index.html without touching the database" do
    host! EDITOR_HOST
    queries = queries_during { get "/" }
    assert_response :success
    assert_includes response.body, "<title>MEDDPICC Editor</title>"
    assert_empty queries
  end

  test "editor responses carry the security and cache headers" do
    host! EDITOR_HOST
    get "/"
    assert_includes response.headers["content-security-policy"], "connect-src 'none'"
    assert_includes response.headers["content-security-policy"], "frame-ancestors 'none'"
    assert_equal "no-cache", response.headers["cache-control"]
    assert_equal "nosniff", response.headers["x-content-type-options"]
  end

  test "app routes are unreachable on the editor host" do
    host! EDITOR_HOST
    queries = queries_during { get "/some-real-app-path" }  # pick a route that queries
    assert_response :not_found
    assert_empty queries
  end

  test "writes are rejected before reaching the app" do
    host! EDITOR_HOST
    queries = queries_during { post "/" }
    assert_response :method_not_allowed
    assert_empty queries
  end

  test "path traversal does not escape vendor/meddpicc" do
    host! EDITOR_HOST
    get "/../config/database.yml"
    assert_not_includes response.body.to_s, "adapter"
    get "/%2e%2e/config/database.yml"
    assert_not_includes response.body.to_s, "adapter"
  end

  test "main host does not serve the editor" do
    host! MAIN_HOST
    get "/index.html"
    assert_response :not_found
  end
end
```

Also add a control test: one real app route on the main host that does query
the database, asserting `queries` is **not** empty. Without it, a broken
subscriber would make every no-query assertion pass silently. For Design B,
test the middleware directly with `Rack::MockRequest`. Cover the redirect from
`/meddpicc` to `/meddpicc/`, the index at `/meddpicc/`, assets under the
prefix, and pass-through for `/`, `/meddpiccx`, and other hosts.

### 5.5 Sync script and source of truth

The MEDDPICC repo stays the source of truth: specs, tests, and history live
there. The Rails repo holds a reviewed copy of a tagged release.

```bash
#!/usr/bin/env bash
# bin/meddpicc-sync
# Copy the MEDDPICC editor's app/ folder at a given git ref into vendor/meddpicc.
# Usage: bin/meddpicc-sync /path/to/meddpicc-repo <tag-or-commit>
set -euo pipefail
src="$1"
ref="$2"
dest="vendor/meddpicc"
sha="$(git -C "$src" rev-parse --short "$ref^{commit}")"
rm -rf "$dest"
mkdir -p "$dest"
git -C "$src" archive "$ref" app | tar -x --strip-components=1 -C "$dest"
echo "Synced MEDDPICC editor $ref ($sha) into $dest"
```

Release flow:

1. In the MEDDPICC repo, run `tests/tests.html`, then tag, e.g. `v1.0.0`.
2. In the Rails repo, run `bin/meddpicc-sync ../meddpicc v1.0.0`.
3. Commit with the tag and SHA in the message, open a PR, and let the Rails
   test suite and CODEOWNERS review gate it.
4. Deploy the Rails app as usual. The editor ships with it.

Because the script uses `git archive`, it copies only committed files, never
local edits. Git submodules are not recommended: they complicate deploys and
CI for little gain.

## 6. Design A specifics: dedicated subdomain

1. **DNS:** add `meddpicc.<your-domain>` pointing to the same load balancer or
   host as the main site, usually as a CNAME.
2. **TLS:** cover the subdomain with the existing wildcard certificate or a new
   certificate. Where the site is fronted by a proxy, add the host there too.
   Examples: Kamal's `proxy.hosts`, a Heroku or Render custom domain, an nginx
   `server_name`, or a CDN hostname.
3. **Config:** set `MEDDPICC_HOST` in each environment, and add the host to
   `config.hosts` if the app uses it.
4. **Cookies:** confirm the session cookie and any other sensitive cookie are
   host-only (Section 4.2).
5. **Local development:** use `meddpicc.localhost`, which Chrome and Firefox
   resolve to the local machine. Add it to `config.hosts` in
   development.

Alternative when nginx already fronts the app: serve `vendor/meddpicc/`
directly from an nginx `server` block for the subdomain, with the same headers
and `limit_except GET HEAD { deny all; }`. Then Rails is not involved at all.
The trade-off is that the headers then live in server config rather than in
the tested Rails code. This variant was not tested.

## 7. Design B specifics: path on the main host

Only if chosen over A:

1. Configure the middleware with `host:` set to the main host and
   `prefix: "/meddpicc"`. The trailing-slash redirect is built in, which
   matters because `index.html` uses relative URLs.
2. **Turbo:** add `data-turbo="false"` to every link that points at the editor.
   As a backstop, add `<meta name="turbo-visit-control" content="reload">` to
   the editor's `index.html`. Otherwise Turbo fetches the page and swaps its
   body into the current page.
3. **Tighten the policy to the editor's path.** On the main origin, `'self'`
   would trust every script the site serves, including any user uploads served
   from the same origin. For Design B, set
   `script-src https://www.<your-domain>/meddpicc/js/` and
   `style-src https://www.<your-domain>/meddpicc/` in the middleware's `CSP`.
   Browsers enforce both this header and the page's own `<meta>` policy.
4. **Audit the main site's third-party scripts.** Every one of them can read
   the editor's working copy. If there are any, switch to A.
5. **Service workers:** check whether the main site registers a service worker
   with scope `/`. If it does, it would intercept editor requests.

## 8. MEDDPICC repo changes

No behavior changes.

1. **Policy tag** in `app/index.html`, as the first element after
   `<meta charset>`:
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'">
   ```
   This tag protects the page when it is opened from disk, and backs up the
   header if the middleware is ever misconfigured. The header adds
   `frame-ancestors`, which a `<meta>` tag cannot set. As measured on
   2026-11-06, the policy triggers console reports only when pasted or opened
   content contains inline `style` attributes or event handlers. The browser
   blocks those attributes, which is the intended outcome. Do not add
   `'unsafe-inline'`, and do not add a `report-uri`.
2. **Turbo backstop meta tag:** Design B only (Section 7).
3. **Favicon (optional):** add `favicon.svg` and
   `<link rel="icon" href="favicon.svg">`. Without one, browsers log a 404 on
   every visit.
4. **README:** add a "Using the hosted version" section. Cover the URL, that
   documents never leave the user's computer, that hosted and local copies keep
   separate working copies, and Safari's 7-day rule (Section 9).
5. **Release tags** for each version synced into Rails.

## 9. Behavior differences: opened from disk vs hosted

| Topic | Opened from disk | Hosted in Rails |
|---|---|---|
| Working copy | Browser storage for local files. Chrome shares one store across all local files. | Browser storage for the editor's origin only. |
| Moving work between them | Separate working copies. Use Download and Open. | Same. |
| Safari | Storage for local files is unreliable. | Normal storage, but Safari deletes script-writable storage for a site with no user interaction in 7 days of Safari use. Each visit resets the clock. Downloads are unaffected. |
| Offline | Always works. | Needs a connection to load. Once loaded it works until reloaded. |
| Updates | User replaces files. | Every Rails deploy updates all users on next load. |

The working copy remains a safety net and downloads remain the durable copy.
The README must say so.

## 10. Caching and updates

- The middleware sends `Cache-Control: no-cache` for every editor file.
  Browsers revalidate on each load, so a deploy reaches everyone at once and
  HTML and scripts never mix versions.
- This is independent of `config.public_file_server.headers`, which applies
  only to `public/`. Newer Rails generators (Rails 8) set a one-year cache
  there. Rails 7.1's generated config does not, which was checked. Keeping the
  editor in `vendor/` sidesteps that setting either way.
- If a CDN or caching proxy sits in front (Cloudflare, CloudFront, Fastly,
  Thruster, nginx `proxy_cache`), confirm it honors `no-cache` for the editor
  host or path.
- **Never ship an editor change that cannot read older files.** The JSON
  `format` and `version` fields support this, and the editor re-validates the
  working copy on load.

## 11. Security, privacy, and access

### Threats

| Threat | Mitigation |
|---|---|
| Malicious file or paste injects script | Allowlist sanitizer (primary). The policy blocks inline script and event handlers (secondary). |
| Injected script exfiltrates data | `connect-src 'none'` and `img-src 'self'` block fetch, XHR, beacons, and image pings. Top-level navigation cannot be blocked by a policy, so the sanitizer stays the primary defense. |
| Other scripts on the site read the working copy | Design A: impossible, because the editor has its own origin. Design B: possible, so audit them (Section 7). |
| Editor compromise reaches the user's Rails account | Design A: blocked by origin isolation. Design B: possible, so the tighter path-scoped policy matters. |
| Someone with Rails deploy rights ships malicious editor code | They could change the headers too. Control this through Rails deploy access, two-factor login, branch protection, and CODEOWNERS on the editor paths. |
| Clickjacking | `frame-ancestors 'none'` header. |
| Third-party code inside the editor | None today. Keep it that way: no CDNs, analytics, fonts, or tag managers. |

### Privacy

- Document content never reaches the server. The policy enforces that.
- Editor requests do not appear in the Rails log, because the middleware runs
  before `Rails::Rack::Logger`. They do appear in proxy, load balancer, and CDN
  logs as normal requests (IP address, user agent, time).
- No cookies are set. The only storage is the functional working copy. A
  consent banner is very likely unnecessary. Confirm with whoever owns
  compliance; this spec is not legal advice.

### Access control

Public by default: the site serves an editor and holds no data. Restricting it
to signed-in users through the Rails login would read the users table on every
request, which conflicts with the no-database requirement. If access must be
restricted, do it in front of Rails without touching the app database.
Options are HTTP basic auth or an SSO proxy (Cloudflare Access, oauth2-proxy,
or the load balancer's built-in auth) on the editor host only.

## 12. Effort estimate

| Task | A. Subdomain | B. Path |
|---|---|---|
| MEDDPICC repo: policy tag, favicon, README, tag release | 1 hour | 1 hour |
| Rails: vendor copy, middleware, config, CODEOWNERS | 1 hour | 1 hour |
| Rails: integration tests, including control test | 1 hour | 1 hour |
| DNS, TLS, proxy host, `config.hosts`, cookie check | 1 to 2 hours plus DNS propagation | none |
| Turbo opt-out, third-party script audit, service worker check | none | 1 hour |
| Acceptance checks in Chrome, Firefox, Safari, Edge | 1 to 2 hours | 1 to 2 hours |
| **Total** | **About one day** | **About half a day** |

## 13. Deployment steps and checks on the real Rails site

1. Inventory the Rails app:
   - Rails and Rack versions.
   - Whether it uses Minitest or RSpec.
   - `bin/rails middleware` in production. Note anything above
     `Rack::Sendfile`.
   - `config.hosts`, `config.force_ssl`, and the session cookie `domain`.
   - What fronts the app: nginx, Kamal proxy, Heroku, Render, or a CDN.
   - Third-party scripts in the layout, and any service worker.
2. Make the MEDDPICC repo changes (Section 8), run its tests, and tag.
3. Add the Rails changes (Section 5) and the design-specific steps (Section 6
   or 7). Run the full Rails test suite.
4. For Design A, create DNS and TLS before deploying.
5. Deploy, then run the acceptance checks.

## 14. Acceptance criteria

1. The editor loads at its URL over HTTPS. HTTP redirects to HTTPS.
2. The Rails integration tests pass, including the zero-query tests and the
   control test.
3. Response headers are present on the live site:
   ```sh
   curl -sI https://meddpicc.<your-domain>/ | grep -iE 'content-security-policy|x-content-type|referrer-policy|cache-control|x-robots'
   ```
4. On the editor host, any app path returns 404 and a POST returns 405.
   Design B: `/meddpicc` redirects to `/meddpicc/`.
5. The main site is unaffected, and its own test suite passes.
6. The README manual checklist passes on the hosted URL in Chrome, Firefox,
   Safari, and Edge. That covers typing, formatting, colors, links, restore
   after closing the tab, Download, Open, malicious files, paste, and print.
7. With clean content, normal use logs no policy violations in the console.
   The browser's network panel shows no requests after the page loads, other
   than the favicon.
8. Opening `app/index.html` from disk still passes the same checklist. A file
   downloaded from the hosted editor opens in the local copy, and the reverse.
9. Design B only: clicking a site link into the editor does a full page load,
   not a Turbo visit.

## 15. Open questions

Each lists the assumption this spec makes.

- **Q1. Subdomain or path?** *Assumption:* Design A, a dedicated subdomain.
- **Q2. What fronts the Rails app?** This decides where TLS and the host
  config go, and whether the nginx variant is an option. *Assumption:* unknown;
  the Rails middleware works behind any of them.
- **Q3. Source of truth.** *Assumption:* the MEDDPICC repo stays separate, and
  Rails holds synced copies of tagged releases. The alternative is moving the
  editor into the Rails repo entirely.
- **Q4. Access.** *Assumption:* public, not indexed, and no login, because
  login through Rails would read the database (Section 11).
- **Q5. Link from the main site.** *Assumption:* a plain link in the site's
  navigation, added in a normal Rails PR. With Design B, it needs
  `data-turbo="false"`.
- **Q6. Test framework.** *Assumption:* Minitest, as shown. Port to RSpec
  request specs if the app uses RSpec.
- **Q7. Safari 7-day rule.** *Assumption:* acceptable with a README note.

## 16. Out of scope, possible later

- Offline use and install, through a service worker and web app manifest.
- A persistent-storage request (`navigator.storage.persist()`) to reduce
  eviction.
- Save in place with the File System Access API in Chrome and Edge.
- Any server-side storage or sync. That would need a new spec and would revisit
  the no-database requirement.

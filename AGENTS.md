# PlainShow Core: notes for developers and AI agents

Core is plainshow.se: the dashboard, accounts, groups and roles, the admin
area and **Updates**, which installs every other part. Laravel 12, Inertia,
React and TypeScript (Vite).

## Layout

- `app/Http/Controllers`: pages and API. `Admin/` holds users, permissions,
  extensions, audit and updates. `GatewayController` signs requests to the
  services (`/api/<service>/v1/...`).
- `app/Support`: `Permissions`, `RoleAccess`, `CapabilityCatalog` (roles,
  groups, capabilities), `Registry` (reads `extensions/*.json`),
  `AccountLifecycle` (asks the root helper to change Linux and Cloud accounts),
  `CloudAccount`, `*Widgets` (dashboard widgets).
- `app/Console/Commands/RunUpdates.php`: the update runner. `config/updates.php`
  lists every component, how it installs and its health URL.
- `extensions/*.json`: one per service (name, URLs, API, widgets, capabilities).
  `php artisan plainshow:extensions` loads them; deploy runs it.
- `resources/js/Pages`: the React pages. `resources/views/errors`: error pages
  (they print kit's pages).
- `ops/deploy.sh`: builds a tag into `/srv/plainshow/<app>/releases`, used for
  core **and login**. It also installs the shared error and updating pages and
  `ops/apache/plainshow-errors.conf`.
- `ops/account-helper.py` (+ sudoers, installer, test): the only root code. It
  validates every name and only touches accounts it created. Change it with care
  and run `python3 ops/test_account_helper.py`.

## Work

- Tests: `php artisan test` (SQLite in memory). Types: `npx tsc --noEmit`.
  Build: `npm run build` (deploy builds it too).
- Migrations: new files only, never edit an old migration. They run on deploy.
- Permissions are capabilities like `cloud.files.view`; roles hold patterns,
  users and groups can be allowed or denied per capability. Check with
  `Permissions::for($user)`, never by role name.
- Updating core installs core itself: the runner keeps the release it is
  running from until the next run, and the Updates page waits while the site
  shows the updating page.
- Adding a component to Updates: add it to `config/updates.php` with `kind`
  (`release` with a deploy script, or `checkout` with steps) and a `health` URL
  whose host is the site (that host gets the updating page).
- Another server: set `PLAINSHOW_PROJECTS`, `PLAINSHOW_CLOUD_SOURCE`,
  `PLAINSHOW_LATEX_SOURCE` in `.env` to where its checkouts are.

## The PlainShow platform

PlainShow is a set of web services on one server, each in its own git repo on
GitHub (`huggan360/plainshow-*`, private). They share one account system and
one look.

| Repo | Site | What it is |
|---|---|---|
| core | plainshow.se | Dashboard, accounts, groups, roles, admin, **Updates**. Laravel + Inertia/React. |
| login | login.plainshow.se | The only sign-in. OAuth2/OpenID Connect server, 2FA, device approval. Laravel. |
| kit | (library) | Shared PHP (auth, signed requests, widgets, access rules) and UI (CSS, JS, fonts, brand, error pages). Used by every app through Composer. |
| cloud | cloud.plainshow.se | Files, photos, calendar, tasks. A frozen Nextcloud 34.0.3 fork; our app is `apps/plainshow`. |
| latex | latex.plainshow.se | Collaborative LaTeX projects. Plain PHP + a websocket server. |
| blog | blog.plainshow.se | Posts, albums, films. Plain PHP. Swedish UI. |
| split | split.plainshow.se | Shared expenses. Plain PHP. Swedish UI. |

### Versions and releases (all repos)

- Versions are semver tags `vX.Y.Z` (patch: fixes; minor: features; major:
  breaking data or API changes). Only tags are installed, never branches.
- A release is: update `CHANGELOG.md` (a `## vX.Y.Z` section at the top, in
  plain words; the Updates page shows it), commit, `git tag -a vX.Y.Z -m vX.Y.Z`,
  `git push origin HEAD vX.Y.Z`.
- Install it through **Updates** in core (Admin, Updates, Install). The cron
  runner (`php artisan plainshow:updates --run`, every minute, in
  `/srv/plainshow/core/current`) fetches tags from GitHub, builds, switches,
  health-checks and rolls back by itself on failure. From a shell you can
  queue a job: insert into `core_update_jobs` (`component`, `action` = update,
  `target` = the tag, `status` = queued) and run the command above.
- While a component installs, visitors of its site see the "updating" page
  (flag file `/srv/plainshow/updating/<host>`, served by
  `core/ops/apache/plainshow-errors.conf`). Old releases are deleted after a
  successful update; nothing legacy is kept.
- Never copy files into `/srv/plainshow` or a live checkout by hand, never
  deploy a working tree (`--worktree` exists for emergencies only), never edit
  `vendor/`. Uncommitted changes in a checkout block its updates.

### Where things are on the server

- Release apps (core, login, blog, split): `/srv/plainshow/<app>/releases/<timestamp>-<tag>`,
  `current` symlink, shared state in `/srv/plainshow/<app>/shared` (`.env` or
  `config/`, `storage/`). Each runs in its own PHP-FPM pool as `plainshow-<app>`
  (the blog runs as www-data).
- Checkout apps: cloud in `/var/www/html/cloud`, latex in
  `/var/www/html/projects/hugohansson/plainshow-latex`. Updates moves them
  forward to a tag and runs their steps (see `core/config/updates.php`).
- Development sources: `/home/hugohansson/projects/plainshow/<repo>`.
- Error and updating pages: made in kit (`ui/errors`, `php bin/errors.php`),
  installed by core's deploy into `/srv/plainshow/errors`, shown by Apache for
  every site and by the apps themselves.
- Backups go to `/mnt/texlive/backups`. **Never touch `/mnt/cloud`** (Cloud's data).

### House rules

- Accounts live in login/core only. Services read identity from Login (OIDC)
  and permissions from core; never add a local password system.
- UI text: short and plain; never use the middle dot character as a
  separator. English in core, login, cloud and latex; Swedish in blog and split.
- Design: kit CSS (`ps-*` classes, `--ps-*` tokens), Outfit for UI text, the
  serif for titles, brand orange `#FC5000`, nested "frame" boxes.
- Secrets: never commit `.env`, `config/*.php` with credentials, keys or
  tokens, and never print them in logs or output.
- Test what you change with the repo's own tests (below) before tagging.

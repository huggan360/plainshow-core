# PlainShow Core: notes for developers and AI agents

Core is plainshow.se: the dashboard, accounts, groups and roles, the admin
area and **Updates**, which installs every other part. Laravel 12, Inertia,
React and TypeScript (Vite).

## Layout

- `app/Http/Controllers`: pages and API. `Admin/` holds the Administration
  page, users, permissions, extensions, audit and updates; `App\Support\AdminAreas`
  says who may open which (it feeds the page, the account menu and the tabs). `GatewayController` signs requests to the
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
- Layouts: desktop items have a place and size on a grid of 12 columns and
  96 px rows (`x`, `y`, `w`, `h`); the phone layout (`phone`, one column of
  `key` and `h`) is null until the phone is changed, and then follows the
  desktop no more (`App\Support\Dashboard`). Widgets declare `min` [w, h] in
  their manifest; `useSize()` gives a widget its size and `tiny` (no title).
  The Design studio uses react-grid-layout (`Pages/Design.tsx`).
- Widgets: `extensions/*.json` declares them (title, sizes, settings); the
  dashboard translates titles with `__()`. `resources/js/Widgets/`: `List.tsx`
  is the one list every widget uses (scrolls on a computer, fixed rows and a
  "more" row on phones), `base.tsx` the shared hooks and frame,
  `Weather.tsx` weather, forecast and radar. Data comes from
  `GET /widgets/{extension}/{widget}` (`?limit=` for more rows).
- Core apps (Weather, later News): `App\Support\CoreApps` lists them (shared
  as `coreApps`, shown in the sidebar above Services). Each is a page in the
  content area with one large frame (`Pages/Weather.tsx`); widgets that belong
  to an app pass `expand` to `WidgetFrame` (or use `ExpandButton`), which grows
  the widget into the app (`Widgets/expand.ts`; the app calls `settleExpand()`).
- News: `App\Support\News` (RSS feeds by source and topic, SVT's regional
  desks for local news, og:image for stories without a picture, pictures
  through `/news/image/{key}` kept in `storage/app/news-images`). Feeds are
  re-read after ten minutes in the background while the old copy is served.
  Preferences in `users.news`. Page: `Pages/News.tsx`.
- Weather places: `users.weather` holds `home` and `saved` (`WeatherController`).
  Weather widgets show their own `place` setting, else home.
- Weather: `App\Support\Weather` (SMHI and Open-Meteo forecasts, SMHI and
  RainViewer radar, Open-Meteo places), cached; no keys. SMHI radar images are
  passed through `/weather/radar/smhi/*.png` and kept in `storage/app/radar`
  for six hours.
- Addresses and server facts: kit `Platform` reads `/etc/plainshow/platform.json`
  (written by plainshow-install; on the first PlainShow it holds plainshow.se's
  layout). Manifests in `extensions/` use `{url}` for the app's address, and an
  app missing from the file is not registered. `config/updates.php` lists only
  installed apps and takes folders, the web user and service names from it;
  `ops/deploy.sh` does the same. Front ends get `platform` (app => address) as a
  shared prop. Never write an app's address into code.
- Assistant (`/assistant`, `Pages/Assistant.tsx`, widget `core.assistant`; not
  `/composer`, which Apache sends to Web): say what
  to do, get cards back. `App\Support\Assistant\Model` asks a local model
  (Qwen3-0.6B Q4_K_M in llama.cpp, `/opt/plainshow-ai`, units `plainshow-ai*`,
  socket-activated on `127.0.0.1:18090` and stopped after 30 idle minutes) for
  JSON actions under a schema; `Engine` checks them against the request, works
  out days and times (`When`, en/sv/nl), does them through the apps' APIs as the
  person (`App\Support\ServiceCall`, signed like the gateway; Cloud's write
  endpoints) and answers with cards, a rare message or question, or a page to
  open. Turns are kept seven days (`core_assistant_turns`); the last one is
  memory for "move it" and for answers to questions. Capability `core.assistant.use`.
  News opens from links: `/news?topic=sweden`, `?tab=local`, `?q=…`, `?read=<id>`.
- `php artisan plainshow:admin <username>` (password on standard input) makes
  an administrator; the installer uses it for the first one.
- Another server: set `PLAINSHOW_PROJECTS`, `PLAINSHOW_CLOUD_SOURCE`,
  `PLAINSHOW_LATEX_SOURCE` in `.env` to where its checkouts are (or `sources`,
  `cloud_dir` and `latex_dir` in the platform file).

## The PlainShow platform

PlainShow is a set of web services on one server, each in its own git repo on
GitHub (`huggan360/plainshow-*`, public). They share one account system and
one look. `plainshow-install` sets up a new server with them (any Linux, any
domain); every address comes from `/etc/plainshow/platform.json` (kit `Platform`).

| Repo | Site | What it is |
|---|---|---|
| core | plainshow.se | Dashboard, accounts, groups, roles, admin, **Updates**. Laravel + Inertia/React. |
| login | login.plainshow.se | The only sign-in. OAuth2/OpenID Connect server, 2FA, device approval. Laravel. |
| kit | (library) | Shared PHP (auth, signed requests, widgets, access rules) and UI (CSS, JS, fonts, brand, error pages). Used by every app through Composer. |
| cloud | cloud.plainshow.se | Files, photos, calendar, tasks. A frozen Nextcloud 34.0.3 fork; our app is `apps/plainshow`. |
| latex | latex.plainshow.se | Collaborative LaTeX projects. Plain PHP + a websocket server. |
| blog | blog.plainshow.se | Posts, albums, films. Plain PHP. Swedish UI. |
| split | split.plainshow.se | Shared expenses. Plain PHP. Swedish UI. |
| install | (installer) | Interactive installer for a new server: packages, apps at their newest release, certificates, first admin. |

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
  separator.

- Design: kit CSS (`ps-*` classes, `--ps-*` tokens), Outfit for UI text, Bree
  Serif for titles, nested "frame" boxes. The primary colour is a theme colour
  (orange `#FC5000` by default, or teal, indigo, red, yellow): use `--ps-accent`,
  `--ps-accent-text`, `--ps-gradient` and `--ps-gradient-ring`, never a fixed
  orange. Text uses `--ps-text-strong` (titles), `--ps-text`, `--ps-text-soft`,
  `--ps-text-muted`, `--ps-text-faint`: dark greys in the light theme, never black.
- Secrets: never commit `.env`, `config/*.php` with credentials, keys or
  tokens, and never print them in logs or output.
- Test what you change with the repo's own tests (below) before tagging.

### Languages (English, Dutch, Swedish)

- Every page speaks English, Dutch or Swedish. The choice is the `ps_lang`
  cookie for the whole domain, set by the language switch in every account
  menu; without it the browser's language decides, then English (kit `Lang`).
- Texts are written in one source language (English in core, login, cloud and
  latex; Swedish in blog and split) and looked up by that text in
  `lang/<code>.json` ({"Source text": "Translation"}). `{name}` placeholders
  are filled in after translating (Laravel's `__()` uses `:name`).
- Wrap every visible text: React `t('...')` and `tn(count, 'one', '{n} many')`
  from the app's `i18n.ts`; Laravel `__('...')`; plain PHP `ps_h('...')` in HTML
  and `ps_t('...')` elsewhere; plain JS `psT('...')`. Never build a sentence
  from pieces; use one text with placeholders. Dates use the chosen locale.
- After adding texts, add their translations and check:
  `python3 vendor/plainshow/kit/bin/i18n-check.py lang/nl.json <code folders>`
  (also `sv.json`, or `en.json` for blog and split).
- The account menu is the same everywhere: Account, the app's own items,
  Language, Theme, then Sign out.

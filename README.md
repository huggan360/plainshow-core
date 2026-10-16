# PlainShow Core

`plainshow.se`: the PlainShow dashboard and platform. It holds accounts, roles and permissions, turns services on and off, installs updates, and serves the API at `plainshow.se/api`. It signs in through [plainshow-login](https://github.com/huggan360/plainshow-login) and builds on [plainshow-kit](https://github.com/huggan360/plainshow-kit).

## What lives here

| Area | Path |
|---|---|
| Dashboard and widgets | `/`, `/widgets/{extension}/{widget}` |
| Design studio: arrange the dashboard, role defaults, tokens | `/design` |
| Account: profile, security, connections, API tokens | `/account/{section}` |
| Administration | `/admin/users`, `/admin/services`, `/admin/permissions`, `/admin/updates`, `/admin/audit` |
| API documentation | `/api` |
| Core API (bearer token) | `/api/core/v1/me`, `/extensions`, `/system`, `/health` |
| Gateway to every service's API | `/api/{service}/v1/...`, `/api/{service}/openapi.json` |

Extensions are described by manifests: `extensions/*.json` here, overridden by an installed extension's own `plainshow.json`. `php artisan plainshow:extensions` syncs them into the platform tables. Admin choices are never overwritten.

## Dashboard

Widgets come from the manifests. Core's own are drawn in `resources/js/Widgets`; an extension's widget is fetched from `{api}/widgets/{id}` with a request signed by `PlainShow\Kit\Widgets` and drawn from typed JSON (list, metrics, gallery). A person's layout is theirs; without one they get their role's default from the Design studio, else the built-in one. `App\Support\Dashboard::sanitize` cleans every saved layout.

## Permissions

Roles hold capability rules (`core_role_capabilities`); people can have allows and denies on top (`core_user_capabilities`, `core_extension_access`). `PlainShow\Kit\Access` resolves them the same way here and in login's token claims. Wildcard rules such as `*.view` never reach `core.*` capabilities. Every change is in the audit log.

## Updates

Core never runs a command. Admin, Updates queues a request in `core_update_jobs`; the runner carries it out:

```sh
php artisan plainshow:updates --check   # installed and latest versions, changelogs, kept releases
php artisan plainshow:updates --run     # queued installs and switches
```

Cron runs it as the deploying user (`--run` every minute, `--check` every six hours). What may be installed, and how, is in `config/updates.php`. A release component builds the tag with its own deploy script, is health-checked and switches back by itself if it does not answer.

## API

Personal tokens are made by login (it holds the signing keys) over signed requests (`PlainShow\Kit\Signed`, secret `PLAINSHOW_INTERNAL_SECRET`). The gateway checks a token's signature, revocation, account and scopes, then passes the call on to the service, signed with the secret core shares with that service and naming the person and their capabilities. Services describe their APIs with `PlainShow\Kit\OpenApi`.

## Database

Shares the `plainshow` MariaDB database with login. Core owns the `core_*` tables. It reads and updates `users` and `audit_events`, but their schema belongs to login.

## Commands

```sh
php artisan plainshow:extensions      # load manifests
php artisan plainshow:updates         # the update runner, see above
php artisan plainshow:import-avatars  # one-time copy of the blog's profile pictures
npm run build
bash ops/deploy.sh core "$PWD" [tag]  # atomic release into /srv/plainshow/core
```

## Checks

```sh
php artisan test
# with login on :8098 and core on :8099 (see the header of the script)
php tests/e2e/sso.php http://127.0.0.1:8098 http://127.0.0.1:8099
```

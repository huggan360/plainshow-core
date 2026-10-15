# PlainShow Core

`plainshow.se`: the PlainShow dashboard and platform. It handles accounts, permissions and services, and serves the `/api` gateway. It signs in through [plainshow-login](https://github.com/huggan360/plainshow-login) and builds on [plainshow-kit](https://github.com/huggan360/plainshow-kit).

## What lives here

| Area | Path |
|---|---|
| Dashboard and widgets | `/`, `/widgets/{extension}/{widget}` |
| Account (profile, security, connections) | `/account/{section}` |
| Administration | `/admin/users`, `/admin/services`, `/admin/audit` |
| Design specimen | `/design` |
| API (bearer token from login) | `/api/core/v1/me`, `/extensions`, `/system`, `/health` |

Extensions are described by manifests: `extensions/*.json` here, overridden by an installed extension's own `plainshow.json`. `php artisan plainshow:extensions` syncs them into the platform tables. Admin choices are never overwritten.

## Database

Shares the `plainshow` MariaDB database with login. Core owns the `core_*` tables. It reads and updates `users` and `audit_events`, but their schema belongs to login.

## Commands

```sh
php artisan plainshow:extensions      # load manifests
php artisan plainshow:import-avatars  # one-time copy of the blog's profile pictures
npm run build
```

## Checks

```sh
# with login on :8098 and core on :8099 (see the header of the script)
php tests/e2e/sso.php http://127.0.0.1:8098 http://127.0.0.1:8099
```

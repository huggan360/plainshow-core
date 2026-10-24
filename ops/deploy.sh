#!/usr/bin/env bash
# Atomic release of a PlainShow Laravel app (core or login).
#
#   ops/deploy.sh <app> <source-checkout> [ref]
#
# Builds <ref> (default: the checkout's HEAD tag or commit) into
# /srv/plainshow/<app>/releases/<name>, links the shared .env and storage,
# migrates, caches, then switches /srv/plainshow/<app>/current in one rename.
# The previous release stays for rollback: ops/deploy.sh <app> --rollback
set -euo pipefail

ROOT=/srv/plainshow
APP=${1:?app name}
SOURCE=${2:?source checkout or --rollback}
REF=${3:-}
BASE="$ROOT/$APP"
KEEP=3

say() { printf '\033[1m%s\033[0m\n' "$*"; }

# Facts about this server from the platform file (/etc/plainshow/platform.json,
# written by the installer), with this Pi's values when it says nothing.
platform() { php -r '$d = json_decode((string) @file_get_contents("/etc/plainshow/platform.json"), true); echo $d["system"][$argv[1]] ?? "";' "$1"; }
PHP_FPM=$(platform php_fpm_service); PHP_FPM=${PHP_FPM:-php8.5-fpm}
WEB_SERVICE=$(platform web_service); WEB_SERVICE=${WEB_SERVICE:-apache2}
WEB_USER=$(platform web_user); WEB_USER=${WEB_USER:-www-data}
APACHE_INCLUDE=$(platform apache_include_dir)

if [ "$SOURCE" = "--rollback" ]; then
    current=$(readlink "$BASE/current")
    previous=$(ls -1dt "$BASE"/releases/* | grep -vx "$current" | head -1)
    [ -n "$previous" ] || { echo "No earlier release to roll back to." >&2; exit 1; }
    ln -sfn "$previous" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
    say "Rolled back to $(basename "$previous")"
    exit 0
fi

cd "$SOURCE"
if [ "$REF" != --worktree ]; then
    [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Commit or stash changes in $SOURCE first." >&2; exit 1; }
fi
REF=${REF:-$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)}
NAME="$(date +%Y%m%d%H%M%S)-${REF//\//-}"
RELEASE="$BASE/releases/$NAME"

say "Building $APP $REF into $RELEASE"
mkdir -p "$BASE/releases" "$BASE/shared"
git archive --format=tar "${REF/--worktree/HEAD}" | (mkdir -p "$RELEASE" && tar -x -C "$RELEASE")
if [ "$REF" = --worktree ]; then
    git diff --binary HEAD | (cd "$RELEASE" && git apply)
    git ls-files --others --exclude-standard -z | tar --null -T - -cf - | tar -x -C "$RELEASE"
fi

# Frontend assets are built in the source checkout, where node_modules
# already lives, and copied over. Releases never carry node_modules.
if [ -f package.json ] && grep -q '"build"' package.json; then
    if [ "$REF" = --worktree ]; then
        npm run build --silent
        cp -a public/build "$RELEASE/public/build"
    else
        git stash list >/dev/null
        tmp=$(mktemp -d)
        git worktree add -f --detach "$tmp" "$REF" >/dev/null 2>&1
        # node_modules stays in the source checkout; it is installed again
        # only when the release's package-lock.json differs from the last one.
        lock=$(sha256sum "$tmp/package-lock.json" | cut -c1-16)
        if [ "$(cat "$SOURCE/node_modules/.plainshow-lock" 2>/dev/null)" != "$lock" ]; then
            (cd "$tmp" && npm ci --no-audit --no-fund --loglevel=error)
            rm -rf "$SOURCE/node_modules"
            mv "$tmp/node_modules" "$SOURCE/node_modules"
            echo "$lock" > "$SOURCE/node_modules/.plainshow-lock"
        fi
        ln -s "$SOURCE/node_modules" "$tmp/node_modules"
        (cd "$tmp" && npm run build --silent)
        cp -a "$tmp/public/build" "$RELEASE/public/build"
        git worktree remove --force "$tmp"
    fi
fi

# Shared state: .env and storage survive releases.
if [ ! -f "$BASE/shared/.env" ]; then
    install -m 0640 "$SOURCE/.env" "$BASE/shared/.env"
fi
if [ ! -d "$BASE/shared/storage" ]; then
    cp -a "$SOURCE/storage" "$BASE/shared/storage"
fi
rm -rf "$RELEASE/storage"
ln -s "$BASE/shared/storage" "$RELEASE/storage"
ln -sfn "$BASE/shared/.env" "$RELEASE/.env"

cd "$RELEASE"
GIT_TERMINAL_PROMPT=0 COMPOSER_NO_INTERACTION=1 composer install --no-dev --optimize-autoloader --no-progress --quiet
# Composer publishes the package copy of the UI kit. For a worktree release,
# restore the locally published assets afterwards so uncommitted kit updates
# are not replaced by the older package revision.
if [ "$REF" = --worktree ] && [ -d "$SOURCE/public/ui" ]; then
    rm -rf "$RELEASE/public/ui"
    cp -a "$SOURCE/public/ui" "$RELEASE/public/ui"
fi
php artisan migrate --force
if [ "$APP" = core ]; then php artisan plainshow:extensions; fi
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Each app runs in its own PHP-FPM pool as plainshow-<app>. That user reads
# the code, its .env and keys, and writes storage. Apache (www-data) may read
# the code to serve static files, but never .env, keys or storage.
# (www-data is the web server's user on Debian; others name it differently.)
APP_USER="plainshow-$APP"
ME=$(id -un)
sudo -n setfacl -m "u:$APP_USER:x" "$ROOT"
sudo -n chown "$ME:$APP_USER" "$BASE" "$BASE/releases"
sudo -n chown -R "$ME:$APP_USER" "$RELEASE" "$BASE/shared"
sudo -n chmod -R g+rX,o-rwx "$RELEASE"
sudo -n setfacl -R -m "u:$WEB_USER:rX" "$RELEASE"
sudo -n setfacl -m "u:$WEB_USER:x" "$BASE" "$BASE/releases"
sudo -n chmod 0750 "$BASE" "$BASE/releases" "$BASE/shared"
sudo -n find "$BASE/shared/storage" "$RELEASE/bootstrap/cache" -type d -exec chmod 2770 {} +
sudo -n find "$BASE/shared/storage" "$RELEASE/bootstrap/cache" -type f -exec chmod 0660 {} +
sudo -n setfacl -m g::rwx "$RELEASE/bootstrap/cache"
sudo -n chmod 0640 "$BASE/shared/.env"
sudo -n find "$BASE/shared/storage" -maxdepth 1 -name '*.key' -exec chmod 0640 {} +
sudo -n setfacl -R -b "$BASE/shared"

# Core also installs the error and "updating" pages every PlainShow site
# shows (kit ui/errors, served by ops/apache/plainshow-errors.conf), and the
# folder the update runner puts its "updating" flags in.
if [ "$APP" = core ]; then
    sudo -n install -d -m 0755 "$ROOT/errors"
    sudo -n install -d -o "$ME" -m 0755 "$ROOT/updating"
    if [ -d "$RELEASE/vendor/plainshow/kit/ui/errors" ]; then
        sudo -n cp "$RELEASE"/vendor/plainshow/kit/ui/errors/* "$ROOT/errors/"
        sudo -n chmod -R a+rX "$ROOT/errors"
    fi
    # Debian's Apache enables extra config with a2enconf; the installer gives
    # every other system a folder Apache includes (apache_include_dir).
    if [ -n "$APACHE_INCLUDE" ]; then
        if ! sudo -n cmp -s "$RELEASE/ops/apache/plainshow-errors.conf" "$APACHE_INCLUDE/plainshow-errors.conf"; then
            sudo -n install -m 0644 "$RELEASE/ops/apache/plainshow-errors.conf" "$APACHE_INCLUDE/plainshow-errors.conf"
            sudo -n apachectl configtest
        fi
    elif ! sudo -n cmp -s "$RELEASE/ops/apache/plainshow-errors.conf" /etc/apache2/conf-available/plainshow-errors.conf; then
        sudo -n install -m 0644 "$RELEASE/ops/apache/plainshow-errors.conf" /etc/apache2/conf-available/plainshow-errors.conf
        sudo -n a2enmod -q headers
        sudo -n a2enconf -q plainshow-errors
        sudo -n apache2ctl configtest
    fi
fi

ln -sfn "$RELEASE" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
# PHP-FPM and mod_php cache resolved paths and opcode; graceful reloads make
# every worker pick up the new release without dropping requests.
sudo -n systemctl reload "$PHP_FPM" || echo "Reload $PHP_FPM to finish switching." >&2
sudo -n systemctl reload "$WEB_SERVICE" || echo "Reload $WEB_SERVICE to finish switching." >&2
say "$APP is now $NAME"

# Keep the last few releases for rollback.
ls -1dt "$BASE"/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf

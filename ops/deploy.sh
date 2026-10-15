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

if [ "$SOURCE" = "--rollback" ]; then
    current=$(readlink "$BASE/current")
    previous=$(ls -1dt "$BASE"/releases/* | grep -vx "$current" | head -1)
    [ -n "$previous" ] || { echo "No earlier release to roll back to." >&2; exit 1; }
    ln -sfn "$previous" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
    say "Rolled back to $(basename "$previous")"
    exit 0
fi

cd "$SOURCE"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Commit or stash changes in $SOURCE first." >&2; exit 1; }
REF=${REF:-$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)}
NAME="$(date +%Y%m%d%H%M%S)-${REF//\//-}"
RELEASE="$BASE/releases/$NAME"

say "Building $APP $REF into $RELEASE"
mkdir -p "$BASE/releases" "$BASE/shared"
git archive --format=tar "$REF" | (mkdir -p "$RELEASE" && tar -x -C "$RELEASE")

# Frontend assets are built in the source checkout, where node_modules
# already lives, and copied over. Releases never carry node_modules.
if [ -f package.json ] && grep -q '"build"' package.json; then
    git stash list >/dev/null
    tmp=$(mktemp -d)
    git worktree add -f --detach "$tmp" "$REF" >/dev/null 2>&1
    ln -s "$SOURCE/node_modules" "$tmp/node_modules"
    (cd "$tmp" && npm run build --silent)
    cp -a "$tmp/public/build" "$RELEASE/public/build"
    git worktree remove --force "$tmp"
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
php artisan migrate --force
if [ "$APP" = core ]; then php artisan plainshow:extensions; fi
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Each app runs in its own PHP-FPM pool as plainshow-<app>. That user reads
# the code, its .env and keys, and writes storage. Apache (www-data) may read
# the code to serve static files, but never .env, keys or storage.
APP_USER="plainshow-$APP"
ME=$(id -un)
sudo -n setfacl -m "u:$APP_USER:x" "$ROOT"
sudo -n chown -R "$ME:$APP_USER" "$RELEASE" "$BASE/shared"
sudo -n chmod -R g+rX,o-rwx "$RELEASE"
sudo -n setfacl -R -m "u:www-data:rX" "$RELEASE"
sudo -n setfacl -m "u:www-data:x" "$BASE" "$BASE/releases"
sudo -n chmod 0750 "$BASE" "$BASE/releases" "$BASE/shared"
sudo -n find "$BASE/shared/storage" "$RELEASE/bootstrap/cache" -type d -exec chmod 2770 {} +
sudo -n find "$BASE/shared/storage" "$RELEASE/bootstrap/cache" -type f -exec chmod 0660 {} +
sudo -n chmod 0640 "$BASE/shared/.env"
sudo -n find "$BASE/shared/storage" -maxdepth 1 -name '*.key' -exec chmod 0640 {} +
sudo -n setfacl -R -b "$BASE/shared"

ln -sfn "$RELEASE" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
# mod_php caches resolved paths and opcode; a graceful reload makes every
# worker pick up the new release without dropping requests.
sudo -n systemctl reload apache2 || echo "Reload Apache to finish switching." >&2
say "$APP is now $NAME"

# Keep the last few releases for rollback.
ls -1dt "$BASE"/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf

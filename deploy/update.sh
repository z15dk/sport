#!/usr/bin/env bash
# Fetches the newest commit, builds it in its own release folder and switches
# over only when the build succeeds, so the running site is never broken.
# Run by scoreline-update.timer every minute; --force rebuilds the current commit.
set -euo pipefail

BASE=/opt/scoreline
APP_USER=scoreline
# shellcheck source=/dev/null
. "$BASE/deploy.conf"
FORCE="${1:-}"

exec 9>"$BASE/.update.lock"
flock -n 9 || exit 0

as_app() { runuser -u "$APP_USER" -- "$@"; }

if [ ! -d "$BASE/repo/.git" ]; then
  as_app git clone --quiet --branch "$BRANCH" "$REPO" "$BASE/repo"
fi
as_app git -C "$BASE/repo" fetch --quiet origin "$BRANCH"
SHA=$(as_app git -C "$BASE/repo" rev-parse --short=12 "origin/$BRANCH")
CURRENT=$(basename "$(readlink -f "$BASE/current" 2>/dev/null || echo none)")

if [ "$SHA" = "$CURRENT" ] && [ "$FORCE" != "--force" ]; then exit 0; fi

echo "Bygger $SHA"
RELEASE="$BASE/releases/$SHA"
rm -rf "$RELEASE"
as_app git -C "$BASE/repo" worktree prune
as_app git -C "$BASE/repo" worktree add --force --detach "$RELEASE" "origin/$BRANCH" >/dev/null

# Reuse installed packages from the running release when the lockfile is unchanged
if [ -f "$BASE/current/package-lock.json" ] && cmp -s "$BASE/current/package-lock.json" "$RELEASE/package-lock.json"; then
  as_app cp -a "$BASE/current/node_modules" "$RELEASE/node_modules"
else
  (cd "$RELEASE" && as_app npm ci --no-audit --no-fund --loglevel=error)
fi

set -a
# shellcheck source=/dev/null
. "$BASE/env"
set +a
if ! (cd "$RELEASE" && as_app env NODE_ENV=production SITE_URL="$SITE_URL" SITE_INDEXABLE="$SITE_INDEXABLE" \
  THESPORTSDB_KEY="${THESPORTSDB_KEY:-3}" NEXT_PUBLIC_THESPORTSDB_KEY="${NEXT_PUBLIC_THESPORTSDB_KEY:-3}" \
  NEXT_TELEMETRY_DISABLED=1 npm run build); then
  echo "Bygget fejlede for $SHA – den kørende version fortsætter" >&2
  as_app git -C "$BASE/repo" worktree remove --force "$RELEASE" || rm -rf "$RELEASE"
  exit 1
fi

ln -sfn "$RELEASE" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
chown -h "$APP_USER": "$BASE/current"
if systemctl is-enabled --quiet scoreline 2>/dev/null; then systemctl restart scoreline; fi
echo "Kører nu $SHA"

# Keep the three newest releases
cd "$BASE/releases"
for old in $(ls -1t | tail -n +4); do
  [ "$BASE/releases/$old" = "$(readlink -f "$BASE/current")" ] && continue
  as_app git -C "$BASE/repo" worktree remove --force "$BASE/releases/$old" 2>/dev/null || rm -rf "${BASE:?}/releases/$old"
done

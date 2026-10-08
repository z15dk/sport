#!/usr/bin/env bash
# Fetches the newest commit, builds it in its own release folder and switches
# over only when the build succeeds, so the running site is never broken.
# Run by scoreline-update.timer every minute; --force rebuilds the current commit.
set -euo pipefail

BASE=/opt/scoreline
APP_USER=scoreline
FORCE="${1:-}"

# The settings are READ, never run: this script runs as root, and the app's user can write in $BASE, so sourcing
# deploy.conf or env would let anyone inside the app run commands as root. Only the keys used here, one by one.
conf() { grep -E "^$2=" "$1" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' || true; }
REPO=$(conf "$BASE/deploy.conf" REPO)
BRANCH=$(conf "$BASE/deploy.conf" BRANCH)
[[ "$REPO" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ ]] || { echo "REPO i deploy.conf ser forkert ud" >&2; exit 1; }
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "BRANCH i deploy.conf ser forkert ud" >&2; exit 1; }

# The lock lives where only root can write (a link planted in $BASE could make root truncate any file)
exec 9>/run/lock/scoreline-update.lock
flock -n 9 || exit 0

as_app() { runuser -u "$APP_USER" -- "$@"; }

if [ ! -d "$BASE/repo/.git" ]; then
  as_app git clone --quiet --branch "$BRANCH" "$REPO" "$BASE/repo"
fi
as_app git -C "$BASE/repo" fetch --quiet origin "$BRANCH"
SHA=$(as_app git -C "$BASE/repo" rev-parse --short=12 "origin/$BRANCH")
# A folder name and an rm -rf target below: only a plain commit id
[[ "$SHA" =~ ^[0-9a-f]{12}$ ]] || { echo "Uventet commit-id: $SHA" >&2; exit 1; }
CURRENT=$(basename "$(readlink -f "$BASE/current" 2>/dev/null || echo none)")

if [ "${CURRENT%%-*}" = "$SHA" ] && [ "$FORCE" != "--force" ]; then exit 0; fi

echo "Bygger $SHA"
RELEASE="$BASE/releases/$SHA"
# Never build into the folder the site is running from (a forced rebuild of the
# current commit): use a new folder and switch over only when the build is done
if [ "$(readlink -f "$BASE/current" 2>/dev/null)" = "$RELEASE" ]; then RELEASE="$BASE/releases/$SHA-$(date +%s)"; fi
rm -rf "$RELEASE"
as_app git -C "$BASE/repo" worktree prune
as_app git -C "$BASE/repo" worktree add --force --detach "$RELEASE" "origin/$BRANCH" >/dev/null

# Reuse installed packages from the running release when the lockfile is unchanged
if [ -d "$BASE/current/node_modules" ] && [ -f "$BASE/current/package-lock.json" ] && cmp -s "$BASE/current/package-lock.json" "$RELEASE/package-lock.json"; then
  as_app cp -a "$BASE/current/node_modules" "$RELEASE/node_modules"
else
  (cd "$RELEASE" && as_app npm ci --no-audit --no-fund --loglevel=error)
fi

SITE_URL=$(conf "$BASE/env" SITE_URL)
SITE_INDEXABLE=$(conf "$BASE/env" SITE_INDEXABLE)
THESPORTSDB_KEY=$(conf "$BASE/env" THESPORTSDB_KEY)
NEXT_PUBLIC_THESPORTSDB_KEY=$(conf "$BASE/env" NEXT_PUBLIC_THESPORTSDB_KEY)
if ! (cd "$RELEASE" && as_app env NODE_ENV=production SITE_URL="$SITE_URL" SITE_INDEXABLE="$SITE_INDEXABLE" \
  THESPORTSDB_KEY="${THESPORTSDB_KEY:-3}" NEXT_PUBLIC_THESPORTSDB_KEY="${NEXT_PUBLIC_THESPORTSDB_KEY:-3}" \
  NEXT_TELEMETRY_DISABLED=1 npm run build); then
  echo "Bygget fejlede for $SHA – den kørende version fortsætter" >&2
  as_app git -C "$BASE/repo" worktree remove --force "$RELEASE" || rm -rf "$RELEASE"
  exit 1
fi

# Chromium for the social media cards (src/lib/socialRender.ts), once per
# Playwright version, in $BASE/browsers. A failure never stops the deploy: the
# site runs without it, only the pictures wait.
BROWSERS="$BASE/browsers"
# Run as the app's user, never root (the release's code is the app's). The system libraries Chromium needs are
# installed once by hand: npx playwright install-deps chromium
PW_VERSION=$(grep -oE '"version": *"[0-9.]+"' "$RELEASE/node_modules/playwright-core/package.json" 2>/dev/null | grep -oE '[0-9.]+' || echo "")
if [ -n "$PW_VERSION" ] && [ ! -f "$BROWSERS/.installed-$PW_VERSION" ]; then
  echo "Installerer Chromium til billederne (Playwright $PW_VERSION)"
  as_app mkdir -p "$BROWSERS"
  if (cd "$RELEASE" && as_app env PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" timeout 900 node node_modules/playwright-core/cli.js install chromium >/dev/null 2>&1); then
    as_app touch "$BROWSERS/.installed-$PW_VERSION"
  else
    echo "Chromium kunne ikke installeres – siden kører videre, billederne venter" >&2
  fi
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

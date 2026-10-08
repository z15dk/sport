#!/usr/bin/env bash
# Matchly's daily backup on the server (matchly-backup.timer, installed as /usr/local/bin/matchly-backup – root's
# own copy: a script in the release, which the app's user owns, must never run as root): every database copied safely while the site runs
# (SQLite's own .backup, as the app's user so no file of the app gets a root owner), the settings and small
# files, and a mirror of the photos – kept 7 days in /var/backups/matchly (root only).
# The photo mirror deletes what the site deletes: borrowed photos must go when their loan ends.
# It guards against a broken database or a mistake, not against losing the server: turn on Hetzner Backups too.
set -euo pipefail
SRC=/opt/scoreline
DEST=/var/backups/matchly
DAY=$(date +%F)
umask 077
install -d -m 700 "$DEST"
# The app's user copies into its own staging folder (it can't reach $DEST, which is root's only)
STAGE=/var/tmp/matchly-backup-stage
rm -rf "$STAGE"
install -d -m 700 -o scoreline -g scoreline "$STAGE"
# The databases, by the app's user
for db in "$SRC"/data/*.db "$SRC"/h2h.db; do
  [ -f "$db" ] || continue
  name=$(basename "$db")
  runuser -u scoreline -- sqlite3 "$db" ".timeout 20000" ".backup '$STAGE/$name'"
done
OUT="$DEST/$DAY"
rm -rf "$OUT"
install -d -m 700 "$OUT"
mv "$STAGE"/*.db "$OUT"/
rmdir "$STAGE"
gzip -f "$OUT"/*.db
# Settings, secrets and the small files (uploads, logos, the photo system's own files)
EXTRA=()
[ -f "$SRC/google-sa.json" ] && EXTRA+=(google-sa.json)
tar czf "$OUT/filer.tgz" -C "$SRC" --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
  --exclude='data/billeder' --exclude='data/delingsbilleder' --exclude='data/sitemaps' \
  env deploy.conf "${EXTRA[@]}" data
# The photos: one mirror, kept in step with the site (deletions included)
install -d -m 700 "$DEST/billeder"
rsync -a --delete "$SRC/data/billeder/" "$DEST/billeder/"
# Seven days
find "$DEST" -maxdepth 1 -type d -name '20*' -mtime +7 -exec rm -rf {} +
echo "Backup $DAY: $(du -sh "$OUT" | cut -f1) databaser og filer, billeder $(du -sh "$DEST/billeder" | cut -f1)"

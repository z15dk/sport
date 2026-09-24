#!/usr/bin/env bash
# Installs Scoreline on a Debian/Ubuntu VPS and keeps it on the newest pushed version.
#
#   curl -fsSL https://raw.githubusercontent.com/z15dk/sport/claude/sofascore-alternativ-forside-r7xj0k/deploy/install.sh | sudo bash
#
# Optional settings (put them before "bash", e.g. "| sudo DOMAIN=scoreline.dk bash"):
#   DOMAIN=scoreline.dk   Serve the site on this domain with HTTPS (via Caddy). DNS must point at the server.
#   PORT=3000             Port the app listens on locally.
#   BRANCH=...            Git branch to follow.
set -euo pipefail

REPO="${REPO:-https://github.com/z15dk/sport.git}"
BRANCH="${BRANCH:-claude/sofascore-alternativ-forside-r7xj0k}"
PORT="${PORT:-3000}"
DOMAIN="${DOMAIN:-}"
APP_USER=scoreline
BASE=/opt/scoreline

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Kør scriptet med sudo." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Scriptet kræver Debian eller Ubuntu (apt-get)." >&2; exit 1; }

say "Installerer git, curl og Node.js 22"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg >/dev/null
node_major=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)
if [ "${node_major:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

say "Opretter brugeren $APP_USER og mappen $BASE"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$BASE/releases"

if [ -n "$DOMAIN" ]; then SITE_URL="https://$DOMAIN"; else SITE_URL="http://$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):$PORT"; fi
if [ ! -f "$BASE/env" ]; then
  cat > "$BASE/env" <<ENV
# Settings for Scoreline. Restart after changes: systemctl restart scoreline
NODE_ENV=production
PORT=$PORT
SITE_URL=$SITE_URL
# Keep false while results are fictional
SITE_INDEXABLE=false
THESPORTSDB_KEY=3
NEXT_PUBLIC_THESPORTSDB_KEY=3
ENV
fi
cat > "$BASE/deploy.conf" <<CONF
REPO=$REPO
BRANCH=$BRANCH
CONF
chown -R "$APP_USER": "$BASE"

say "Installerer opdateringsscriptet"
curl -fsSL "https://raw.githubusercontent.com/z15dk/sport/$BRANCH/deploy/update.sh" -o /usr/local/bin/scoreline-update
chmod 755 /usr/local/bin/scoreline-update

say "Opretter systemd-tjenester"
cat > /etc/systemd/system/scoreline.service <<UNIT
[Unit]
Description=Scoreline (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$BASE/current
EnvironmentFile=$BASE/env
ExecStart=/usr/bin/env node node_modules/next/dist/bin/next start -p \${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/scoreline-update.service <<UNIT
[Unit]
Description=Hent og byg nyeste version af Scoreline
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/scoreline-update
UNIT

cat > /etc/systemd/system/scoreline-update.timer <<UNIT
[Unit]
Description=Tjek for ny version af Scoreline hvert minut

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
UNIT

say "Henter og bygger første version (tager et par minutter)"
/usr/local/bin/scoreline-update --force

systemctl daemon-reload
systemctl enable --now scoreline.service scoreline-update.timer >/dev/null

if [ -n "$DOMAIN" ]; then
  if command -v nginx >/dev/null && ss -ltn | grep -q ':80 '; then
    say "nginx kører allerede – tilføj denne server-blok selv:"
    cat <<NGINX
server {
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
    echo "…og kør derefter: certbot --nginx -d $DOMAIN"
  else
    say "Installerer Caddy til $DOMAIN med automatisk HTTPS"
    if ! command -v caddy >/dev/null; then
      apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
      curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq && apt-get install -y -qq caddy >/dev/null
    fi
    cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:$PORT
}
CADDY
    systemctl reload caddy || systemctl restart caddy
  fi
  command -v ufw >/dev/null && ufw status | grep -q active && ufw allow 80,443/tcp >/dev/null || true
else
  command -v ufw >/dev/null && ufw status | grep -q active && ufw allow "$PORT"/tcp >/dev/null || true
fi

sleep 3
if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
  say "Færdig! Siden kører på $SITE_URL"
else
  echo "Serveren svarer ikke endnu. Se loggen med: journalctl -u scoreline -n 50" >&2
fi
cat <<INFO

Nye versioner hentes og udrulles automatisk hvert minut.
  Status:        systemctl status scoreline
  Log:           journalctl -u scoreline -f
  Opdateringer:  journalctl -u scoreline-update -f
  Indstillinger: $BASE/env
INFO

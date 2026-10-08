#!/usr/bin/env bash
# Sets up the Claude editor on the VPS (run once as root, from the release: deploy/claude-editor/install.sh).
# 1. Its own user without a login shell, home /var/lib/matchly-editor.
# 2. Claude Code for that user.
# 3. /etc/matchly-editor.env (mode 600) – the owner fills in CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`
#    on their own Mac; EDITOR_TOKEN is made here and must also be in /opt/scoreline/env (then restart scoreline).
# 4. The service and timer. Nothing runs before the token is in place (run.sh fails without it).
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
id matchly-editor >/dev/null 2>&1 || useradd --system --home-dir /var/lib/matchly-editor --create-home --shell /usr/sbin/nologin matchly-editor
install -d -o matchly-editor -g matchly-editor -m 700 /var/lib/matchly-editor
# Claude Code (global npm package, same node as the site)
command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code
# The site's own port (PORT in /opt/scoreline/env – other apps run on the same server)
if [ ! -f /etc/matchly-editor.env ]; then
  token=$(openssl rand -hex 32)
  umask 077
  cat > /etc/matchly-editor.env <<ENV
# Claude-redaktøren (deploy/claude-editor). CLAUDE_CODE_OAUTH_TOKEN: kør \`claude setup-token\` på din egen Mac og indsæt værdien.
CLAUDE_CODE_OAUTH_TOKEN=
EDITOR_TOKEN=$token
SITE=http://127.0.0.1:$(grep -oP '^PORT=\K[0-9]+' /opt/scoreline/env || echo 3000)
ENV
  # Only root: systemd reads it before the writer starts, the writer itself never needs to
  chown root:root /etc/matchly-editor.env
  chmod 600 /etc/matchly-editor.env
  # The site needs the same key to let the editor in
  grep -q '^EDITOR_TOKEN=' /opt/scoreline/env || echo "EDITOR_TOKEN=$token" >> /opt/scoreline/env
  echo "Ny EDITOR_TOKEN lagt i /etc/matchly-editor.env og /opt/scoreline/env – genstart scoreline: systemctl restart scoreline"
fi
install -m 644 "$HERE/matchly-editor.service" "$HERE/matchly-editor.timer" "$HERE/matchly-nyhedsspejder.service" "$HERE/matchly-nyhedsspejder.timer" "$HERE/matchly-editor.path" /etc/systemd/system/
systemctl daemon-reload
systemctl enable matchly-editor.timer >/dev/null
# "Skriv om" from admin starts a run right away
systemctl enable --now matchly-editor.path >/dev/null
# The news scout (NYHEDER.md, run-nyheder.sh): same user and key, every morning at 07.00
systemctl enable --now matchly-nyhedsspejder.timer >/dev/null
echo "Klar. Indsæt CLAUDE_CODE_OAUTH_TOKEN i /etc/matchly-editor.env, og start timeren: systemctl start matchly-editor.timer"
echo "Prøv en kørsel nu: systemctl start matchly-editor.service && journalctl -u matchly-editor -n 50"

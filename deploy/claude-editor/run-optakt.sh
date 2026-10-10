#!/usr/bin/env bash
# The preview round (matchly-optakt.timer): morning and afternoon James writes a researched preview for every Danish
# match in the next 36 hours (OPTAKT.md, /api/redaktor/optakter) and publishes it himself – never on Facebook, not in
# the article list (the owner's word 10/10-2026). Same user, key and limits as the other rounds: only matchly-api, web
# search and its own folder. The model is Opus 5.5 unless OPTAKT_MODEL says otherwise.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/OPTAKT.md"
mkdir -p /var/lib/matchly-editor/optakt
cd /var/lib/matchly-editor/optakt
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
echo "$(date -Is) optakt-runden starter (model ${OPTAKT_MODEL:-claude-opus-5-5})"
write() {
  claude -p "$(cat "$PROMPT")

I DAG: $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M')." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 400 \
    --output-format text
}
write --model "${OPTAKT_MODEL:-claude-opus-5-5}" || { echo "$(date -Is) ${OPTAKT_MODEL:-claude-opus-5-5} fejlede – prøver standardmodellen"; write; }

#!/usr/bin/env bash
# The Danes abroad (matchly-udlandet.timer): Monday and Thursday James keeps /danskere-i-udlandet up to date – the list,
# a line on each player and the weekly roundup (UDLANDET.md, /api/redaktor/udlandet). Same user, key and limits as the
# other rounds. The model is Opus 5.5 unless UDLANDET_MODEL says otherwise.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/UDLANDET.md"
mkdir -p /var/lib/matchly-editor/udlandet
cd /var/lib/matchly-editor/udlandet
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
echo "$(date -Is) udlandet-runden starter (model ${UDLANDET_MODEL:-claude-opus-5-5})"
write() {
  claude -p "$(cat "$PROMPT")

I DAG: $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M')." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 400 \
    --output-format text
}
write --model "${UDLANDET_MODEL:-claude-opus-5-5}" || { echo "$(date -Is) ${UDLANDET_MODEL:-claude-opus-5-5} fejlede – prøver standardmodellen"; write; }

#!/usr/bin/env bash
# The trend hunter (matchly-trend.path): the site has seen a football search trending in Denmark (src/lib/trendWatch.ts)
# and James writes a quick news draft on it while it is hot (TREND.md, /api/redaktor/trends) and mails it to the owner.
# Same user, key and limits as the other rounds. The model is Opus 5.5 unless TREND_MODEL says otherwise.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/TREND.md"
mkdir -p /var/lib/matchly-editor/trend
cd /var/lib/matchly-editor/trend
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
echo "$(date -Is) trend-runden starter (model ${TREND_MODEL:-claude-opus-5-5})"
write() {
  claude -p "$(cat "$PROMPT")

I DAG: $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M')." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 400 \
    --output-format text
}
write --model "${TREND_MODEL:-claude-opus-5-5}" || { echo "$(date -Is) ${TREND_MODEL:-claude-opus-5-5} fejlede – prøver standardmodellen"; write; }

#!/usr/bin/env bash
# The news scout (matchly-nyhedsspejder.timer): every morning Claude finds the day's football news, writes 1–2 news
# drafts through the site's editor API (/api/redaktor/nyheder, key EDITOR_TOKEN), mails them to the owner and fixes
# the coach list. Same user, key and limits as the editor (run.sh): only matchly-api, web search and its own folder.
# The model is Fable unless SPEJDER_MODEL in /etc/matchly-editor.env says otherwise; if it fails, the default model.
# Runs at 07, 12 and 19 (matchly-nyhedsspejder.timer), and when the owner asks from admin (matchly-nyhedsspejder.path,
# the extra round); the round is told in the prompt.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/NYHEDER.md"
# Its own folder next to the editor's, so the two never mix their article files
mkdir -p /var/lib/matchly-editor/nyheder
cd /var/lib/matchly-editor/nyheder
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
echo "$(date -Is) nyhedsspejderen starter (model ${SPEJDER_MODEL:-claude-fable-5-1})"
# Only: the site's editor API (matchly-api), web search and web pages, and files in its own folder.
# No curl, no other commands, no files outside the folder – so a web page can never get it to send a key out.
# Which round this is (the prompt says how much each round writes): morgen before 10, middag before 16, else aften
hour=$(TZ=Europe/Copenhagen date +%H)
round=aften; [ "$hour" -lt 16 ] && round=middag; [ "$hour" -lt 10 ] && round=morgen
# Started by the owner from admin ("Find nyheder nu"): the extra round, up to 2 articles (the mark is left by the service)
if [ -e ekstra ]; then round=ekstra; rm -f ekstra; fi
echo "Runde: $round"
scout() {
  claude -p "$(cat "$PROMPT")

DENNE KØRSEL: $round-runden, $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M')." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 150 \
    --output-format text
}
# Fable first; if it fails (e.g. the subscription's limit for it is used up), the same round with the default model.
# The prompt makes it skip what Matchly already has, so a half-finished first try is never written twice.
scout --model "${SPEJDER_MODEL:-claude-fable-5-1}" || { echo "$(date -Is) ${SPEJDER_MODEL:-claude-fable-5-1} fejlede – prøver standardmodellen"; scout; }

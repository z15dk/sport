#!/usr/bin/env bash
# The growth round (matchly-vaekst.timer): every morning James reads the page views and Google numbers through the
# site's editor API (/api/redaktor/vaekst, key EDITOR_TOKEN), sets better titles on pages close to page 1, judges his
# 14-day title tests, finds article ideas for the news scout and writes his diary (shown on /admin/vaekst). Same user,
# key and limits as the editor (run.sh): only matchly-api, web search and its own folder.
# The model is Opus 5.5 unless VAEKST_MODEL in /etc/matchly-editor.env says otherwise (analysis and short titles;
# the writing is done by the news scout with Fable); if it fails, the default model.
# Runs once a day at 06.30 (matchly-vaekst.timer).
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/VAEKST.md"
# Its own folder next to the editor's, so the two never mix their article files
mkdir -p /var/lib/matchly-editor/vaekst
cd /var/lib/matchly-editor/vaekst
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
echo "$(date -Is) vækstrunden starter (model ${VAEKST_MODEL:-claude-opus-5-5})"
# Only: the site's editor API (matchly-api), web search and web pages, and files in its own folder.
# No curl, no other commands, no files outside the folder – so a web page can never get it to send a key out.
grow() {
  claude -p "$(cat "$PROMPT")

I DAG: $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M')." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 150 \
    --output-format text
}
# Opus 5.5 first (the owner's choice for the growth round); if it fails, the default model
grow --model "${VAEKST_MODEL:-claude-opus-5-5}" || { echo "$(date -Is) ${VAEKST_MODEL:-claude-opus-5-5} fejlede – prøver standardmodellen"; grow; }

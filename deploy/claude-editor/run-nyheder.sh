#!/usr/bin/env bash
# The news scout (matchly-nyhedsspejder.timer): every morning Claude finds the day's football news, writes 1–2 news
# drafts through the site's editor API (/api/redaktor/nyheder, key EDITOR_TOKEN), mails them to the owner and fixes
# the coach list. Same user, key and limits as the editor (run.sh): only matchly-api, web search and its own folder.
# The model is Fable unless SPEJDER_MODEL in /etc/matchly-editor.env says otherwise.
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
exec claude -p "$(cat "$PROMPT")" \
  --model "${SPEJDER_MODEL:-claude-fable-5-1}" \
  --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" "Write(./**)" \
  --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" \
  --max-turns 150 \
  --output-format text

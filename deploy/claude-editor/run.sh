#!/usr/bin/env bash
# The Claude editor (matchly-editor.timer): Claude Code reads the new automatic drafts through the site's
# editor API (/api/redaktor, key EDITOR_TOKEN), checks the facts on the web, fixes small things and leaves a
# verdict that the approval mails show. Runs as its own user with the subscription's token
# (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`); only matchly-api, web search and its own folder allowed. Env: /etc/matchly-editor.env.
set -euo pipefail
PROMPT="$(dirname "$(readlink -f "$0")")/PROMPT.md"
# Claude works in its own folder (the release is read-only for it); matchly-api lies next to this script
cd /var/lib/matchly-editor
export PATH="$(dirname "$(readlink -f "$0")"):$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
# Nothing to read: no Claude run at all
count=$(curl -fsS -H "Authorization: Bearer ${EDITOR_TOKEN}" "$SITE/api/redaktor/kladder" | grep -o '"id":' | wc -l || echo 0)
if [ "${count:-0}" -eq 0 ]; then echo "Ingen nye kladder"; exit 0; fi
echo "$(date -Is) $count kladde(r) til redaktøren"
# Only: the site's editor API (matchly-api), web search and web pages, and files in its own folder.
# No curl, no other commands, no files outside the folder – so a web page can never get it to send a key out.
exec claude -p "$(cat "$PROMPT")" \
  --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
  --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" \
  --max-turns 80 \
  --output-format text

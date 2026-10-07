#!/usr/bin/env bash
# The Claude editor (matchly-editor.timer): Claude Code reads the new automatic drafts through the site's
# editor API (/api/redaktor, key EDITOR_TOKEN), checks the facts on the web, fixes small things and leaves a
# verdict that the approval mails show. Runs as its own user with the subscription's token
# (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`), only curl and web search allowed. Env: /etc/matchly-editor.env.
set -euo pipefail
PROMPT="$(dirname "$(readlink -f "$0")")/PROMPT.md"
# Claude works in its own folder (the release is read-only for it)
cd /var/lib/matchly-editor
: "${SITE:=http://127.0.0.1:3000}"
export SITE
# Nothing to read: no Claude run at all
count=$(curl -fsS -H "Authorization: Bearer ${EDITOR_TOKEN}" "$SITE/api/redaktor/kladder" | grep -o '"id":' | wc -l || echo 0)
if [ "${count:-0}" -eq 0 ]; then echo "Ingen nye kladder"; exit 0; fi
echo "$(date -Is) $count kladde(r) til redaktøren"
exec claude -p "$(cat "$PROMPT")" \
  --allowedTools "Bash(curl:*)" "WebSearch" "WebFetch" "Read" "Write" \
  --max-turns 80 \
  --output-format text

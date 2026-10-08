#!/usr/bin/env bash
# The Claude editor (matchly-editor.timer): Claude Code reads the new automatic drafts through the site's
# editor API (/api/redaktor, key EDITOR_TOKEN), checks the facts on the web, fixes small things and leaves a
# verdict that the approval mails show. Writes with Fable (SKRIBENT_MODEL in the env overrides it), else the default model. Runs as its own user with the subscription's token
# (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`); only matchly-api, web search and its own folder allowed. Env: /etc/matchly-editor.env.
set -euo pipefail
PROMPT="$(dirname "$(readlink -f "$0")")/PROMPT.md"
# Claude works in its own folder (the release is read-only for it); matchly-api lies next to this script.
# A folder below its home, never the home itself: Claude's own settings (~/.claude, ~/.claude.json) live there, and a
# writer allowed to edit them could give itself new tools for the next run.
mkdir -p /var/lib/matchly-editor/arbejde
cd /var/lib/matchly-editor/arbejde
export PATH="$(dirname "$(readlink -f "$0")"):$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
# Nothing to read: no Claude run at all
count=$(curl -fsS -H "Authorization: Bearer ${EDITOR_TOKEN}" "$SITE/api/redaktor/kladder" | grep -o '"id":' | wc -l || echo 0)
if [ "${count:-0}" -eq 0 ]; then echo "Ingen nye kladder"; exit 0; fi
echo "$(date -Is) $count kladde(r) til redaktøren"
# Only: the site's editor API (matchly-api), web search and web pages, and files in its own folder.
# No curl, no other commands, no files outside the folder – so a web page can never get it to send a key out.
write() {
  claude -p "$(cat "$PROMPT")" "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 200 \
    --output-format text
}
# Fable writes (the owner's choice); if it fails (e.g. the subscription's limit for it is used up), the default model
write --model "${SKRIBENT_MODEL:-claude-fable-5-1}" || { echo "$(date -Is) ${SKRIBENT_MODEL:-claude-fable-5-1} fejlede – prøver standardmodellen"; write; }

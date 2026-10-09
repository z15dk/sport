#!/usr/bin/env bash
# The quiz round (matchly-quiz.timer): Monday, Wednesday and Friday James tops the "Gæt klubben" series up to two weeks
# ahead (six episodes not posted yet) through
# the site's editor API (/api/redaktor/quiz, key EDITOR_TOKEN): he picks a club not used yet, writes three text clues
# from hard to easy and the post's text; Matchly makes the video (src/lib/quizReel.tsx) for /admin/sociale/quiz. Same
# user, key and limits as the growth round (run-vaekst.sh): only matchly-api, web search and its own folder.
# Every episode is hard (svær). Opus 5.5 unless QUIZ_MODEL says otherwise.
set -euo pipefail
BIN="$(dirname "$(readlink -f "$0")")"
PROMPT="$BIN/QUIZ.md"
mkdir -p /var/lib/matchly-editor/quiz
cd /var/lib/matchly-editor/quiz
export PATH="$BIN:$PATH"
: "${SITE:?SITE mangler i /etc/matchly-editor.env (sitets egen port, PORT i /opt/scoreline/env)}"
export SITE
# Every episode is hard: the owner wants to challenge people (10 October 2026)
LEVEL=svær
echo "$(date -Is) quiz-runden starter (sværhedsgrad $LEVEL, model ${QUIZ_MODEL:-claude-opus-5-5})"
quiz() {
  claude -p "$(cat "$PROMPT")

I DAG: $(TZ=Europe/Copenhagen date '+%A %-d. %B %Y kl. %H.%M'). Sværhedsgrad: $LEVEL." \
    "$@" \
    --allowedTools "Bash(matchly-api:*)" "WebSearch" "WebFetch" "Read(./**)" "Edit(./**)" "Write(./**)" \
    --disallowedTools "Bash(curl:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(cat:*)" "Read(~/.claude/**)" "Edit(~/.claude/**)" "Read(~/.claude.json)" "Edit(~/.claude.json)" \
    --max-turns 250 \
    --output-format text
}
quiz --model "${QUIZ_MODEL:-claude-opus-5-5}" || { echo "$(date -Is) ${QUIZ_MODEL:-claude-opus-5-5} fejlede – prøver standardmodellen"; quiz; }

#!/usr/bin/env bash
set -euo pipefail

OLD_HEALTH_URL="${OLD_HEALTH_URL:-http://127.0.0.1:3310/api/health}"
NEW_API_BASE="${NEW_API_BASE:-http://127.0.0.1:3320/api}"
LOGIN_EMAIL="${LOGIN_EMAIL:-admin@nexus-flow.local}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-admin123}"

echo "== old app health =="
curl -fsS "$OLD_HEALTH_URL"
echo

echo "== new api health =="
curl -fsS "$NEW_API_BASE/health"
echo

echo "== login new api =="
LOGIN_JSON="$(curl -fsS -X POST "$NEW_API_BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}")"
echo "$LOGIN_JSON"
TOKEN="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.token||"")' "$LOGIN_JSON")"
if [ -z "$TOKEN" ]; then
  echo "Missing token in login response"
  exit 1
fi

echo
echo "== list projects =="
PROJECTS_JSON="$(curl -fsS "$NEW_API_BASE/projects" -H "Authorization: Bearer $TOKEN")"
echo "$PROJECTS_JSON"
PROJECT_ID="$(node -e 'const x=JSON.parse(process.argv[1]); const p=(x.projects||[])[0]; process.stdout.write(p ? p.id : "")' "$PROJECTS_JSON")"
if [ -z "$PROJECT_ID" ]; then
  echo "No project found"
  exit 1
fi

echo
echo "== list tasks =="
curl -fsS "$NEW_API_BASE/tasks?projectId=$PROJECT_ID" -H "Authorization: Bearer $TOKEN"
echo
echo "Smoke test passed."

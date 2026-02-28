#!/usr/bin/env bash
set -euo pipefail

NEW_API_BASE="${NEW_API_BASE:-http://127.0.0.1:3320/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nexus-flow.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MANAGER_EMAIL="${MANAGER_EMAIL:-manager@nexus-flow.local}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-manager123}"
EMPLOYEE_EMAIL="${EMPLOYEE_EMAIL:-ivan@nexus-flow.local}"
EMPLOYEE_PASSWORD="${EMPLOYEE_PASSWORD:-123456}"

request_with_code() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local data="${4:-}"
  local tmp
  tmp="$(mktemp)"
  local code
  if [ -n "$token" ] && [ -n "$data" ]; then
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$data")"
  elif [ -n "$token" ]; then
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" -H "Authorization: Bearer $token")"
  elif [ -n "$data" ]; then
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "$data")"
  else
    code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url")"
  fi
  local body
  body="$(cat "$tmp")"
  rm -f "$tmp"
  printf "%s\n%s" "$code" "$body"
}

api_expect_code() {
  local expected="$1"
  local method="$2"
  local url="$3"
  local token="${4:-}"
  local data="${5:-}"
  local response
  response="$(request_with_code "$method" "$url" "$token" "$data")"
  local code="${response%%$'\n'*}"
  local body="${response#*$'\n'}"
  if [ "$code" != "$expected" ]; then
    echo "Expected $expected, got $code for $method $url"
    echo "$body"
    exit 1
  fi
  printf "%s" "$body"
}

echo "== health =="
api_expect_code 200 GET "$NEW_API_BASE/health" "" >/dev/null
echo "ok"

echo
echo "== login roles =="
ADMIN_LOGIN="$(api_expect_code 200 POST "$NEW_API_BASE/auth/login" "" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
MANAGER_LOGIN="$(api_expect_code 200 POST "$NEW_API_BASE/auth/login" "" "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\"}")"
EMPLOYEE_LOGIN="$(api_expect_code 200 POST "$NEW_API_BASE/auth/login" "" "{\"email\":\"$EMPLOYEE_EMAIL\",\"password\":\"$EMPLOYEE_PASSWORD\"}")"

ADMIN_TOKEN="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.token||"")' "$ADMIN_LOGIN")"
MANAGER_TOKEN="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.token||"")' "$MANAGER_LOGIN")"
EMPLOYEE_TOKEN="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.token||"")' "$EMPLOYEE_LOGIN")"
if [ -z "$ADMIN_TOKEN" ] || [ -z "$MANAGER_TOKEN" ] || [ -z "$EMPLOYEE_TOKEN" ]; then
  echo "Missing one or more auth tokens"
  exit 1
fi
echo "ok"

echo
echo "== resolve project/members =="
PROJECTS_JSON="$(api_expect_code 200 GET "$NEW_API_BASE/projects" "$ADMIN_TOKEN")"
PROJECT_ID="$(node -e 'const x=JSON.parse(process.argv[1]);const p=(x.projects||[])[0];process.stdout.write(p?p.id:"")' "$PROJECTS_JSON")"
if [ -z "$PROJECT_ID" ]; then
  echo "No project found"
  exit 1
fi

MEMBERS_JSON="$(api_expect_code 200 GET "$NEW_API_BASE/projects/$PROJECT_ID/members" "$ADMIN_TOKEN")"
EMPLOYEE_ID="$(node -e 'const x=JSON.parse(process.argv[1]);const u=(x.members||[]).find((m)=>m.role==="employee");process.stdout.write(u?u.id:"")' "$MEMBERS_JSON")"
if [ -z "$EMPLOYEE_ID" ]; then
  echo "Project members missing employee"
  exit 1
fi
echo "project=$PROJECT_ID"

echo
echo "== create task (admin -> employee) =="
TITLE="E2E Critical $(date +%s)"
DUE_AT="$(node -e 'process.stdout.write(new Date(Date.now()+2*60*60*1000).toISOString())')"
CREATE_BODY="$(api_expect_code 201 POST "$NEW_API_BASE/tasks" "$ADMIN_TOKEN" "{\"projectId\":\"$PROJECT_ID\",\"assignedTo\":\"$EMPLOYEE_ID\",\"title\":\"$TITLE\",\"description\":\"E2E validation flow\",\"priority\":\"high\",\"status\":\"todo\",\"dueDate\":\"$DUE_AT\"}")"
TASK_ID="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write((x.task&&x.task.id)||"")' "$CREATE_BODY")"
if [ -z "$TASK_ID" ]; then
  echo "Task create returned no id"
  exit 1
fi
echo "task=$TASK_ID"

echo
echo "== employee flow: list/comment/attach/move done =="
EMP_TASKS="$(api_expect_code 200 GET "$NEW_API_BASE/tasks?projectId=$PROJECT_ID" "$EMPLOYEE_TOKEN")"
SEEN="$(node -e 'const x=JSON.parse(process.argv[1]);const id=process.argv[2];process.stdout.write((x.tasks||[]).some(t=>t.id===id)?"1":"0")' "$EMP_TASKS" "$TASK_ID")"
if [ "$SEEN" != "1" ]; then
  echo "Employee cannot see own assigned task"
  exit 1
fi
api_expect_code 201 POST "$NEW_API_BASE/tasks/$TASK_ID/comments" "$EMPLOYEE_TOKEN" "{\"content\":\"Done checklist executed.\"}" >/dev/null
BASE64_TEXT="listO e2e attachment"
BASE64_PAYLOAD="$(printf "%s" "$BASE64_TEXT" | base64 | tr -d '\n')"
ATTACH_BODY="$(api_expect_code 201 POST "$NEW_API_BASE/tasks/$TASK_ID/attachments" "$EMPLOYEE_TOKEN" "{\"fileName\":\"e2e-note.txt\",\"fileDataBase64\":\"$BASE64_PAYLOAD\",\"originalFileName\":\"e2e-note.txt\",\"mimeType\":\"text/plain\"}")"
ATTACHMENT_ID="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write((x.attachment&&x.attachment.id)||"")' "$ATTACH_BODY")"
if [ -z "$ATTACHMENT_ID" ]; then
  echo "Attachment create returned no id"
  exit 1
fi
DOWNLOADED="$(api_expect_code 200 GET "$NEW_API_BASE/tasks/$TASK_ID/attachments/$ATTACHMENT_ID/download" "$EMPLOYEE_TOKEN")"
if [ "$DOWNLOADED" != "$BASE64_TEXT" ]; then
  echo "Attachment download content mismatch"
  exit 1
fi
api_expect_code 200 PATCH "$NEW_API_BASE/tasks/$TASK_ID/status" "$EMPLOYEE_TOKEN" "{\"status\":\"done\",\"position\":3000}" >/dev/null
echo "ok"

echo
echo "== ACL checks (employee forbidden on foreign + review) =="
ADMIN_TASKS="$(api_expect_code 200 GET "$NEW_API_BASE/tasks?projectId=$PROJECT_ID" "$ADMIN_TOKEN")"
FOREIGN_TASK_ID="$(node -e 'const x=JSON.parse(process.argv[1]);const emp=process.argv[2];const t=(x.tasks||[]).find((row)=>!row.archived_at && (row.assigned_to!==emp));process.stdout.write(t?t.id:"")' "$ADMIN_TASKS" "$EMPLOYEE_ID")"
if [ -z "$FOREIGN_TASK_ID" ]; then
  echo "No foreign task found for ACL validation"
  exit 1
fi
api_expect_code 403 POST "$NEW_API_BASE/tasks/$FOREIGN_TASK_ID/comments" "$EMPLOYEE_TOKEN" "{\"content\":\"should fail\"}" >/dev/null
api_expect_code 403 GET "$NEW_API_BASE/tasks/$FOREIGN_TASK_ID/attachments" "$EMPLOYEE_TOKEN" >/dev/null
api_expect_code 403 PATCH "$NEW_API_BASE/tasks/$TASK_ID/review" "$EMPLOYEE_TOKEN" "{\"decision\":\"approve\",\"comment\":\"n/a\"}" >/dev/null
echo "ok"

echo
echo "== manager review + archive =="
api_expect_code 200 PATCH "$NEW_API_BASE/tasks/$TASK_ID/review" "$MANAGER_TOKEN" "{\"decision\":\"approve\",\"comment\":\"Looks good.\"}" >/dev/null
api_expect_code 200 PATCH "$NEW_API_BASE/tasks/$TASK_ID/archive" "$MANAGER_TOKEN" "{\"archived\":true}" >/dev/null
FINAL_TASKS="$(api_expect_code 200 GET "$NEW_API_BASE/tasks?projectId=$PROJECT_ID&includeArchived=1" "$ADMIN_TOKEN")"
FINAL_OK="$(node -e 'const x=JSON.parse(process.argv[1]);const id=process.argv[2];const t=(x.tasks||[]).find((row)=>row.id===id);const ok=Boolean(t&&t.review_status==="approved"&&t.archived_at);process.stdout.write(ok?"1":"0")' "$FINAL_TASKS" "$TASK_ID")"
if [ "$FINAL_OK" != "1" ]; then
  echo "Final task state invalid (expected approved + archived)"
  exit 1
fi
echo "ok"

echo
echo "critical e2e passed."

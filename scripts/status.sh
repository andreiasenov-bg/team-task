#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== git =="
echo "branch: $(git rev-parse --abbrev-ref HEAD)"
echo "commit: $(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  echo "worktree: dirty"
else
  echo "worktree: clean"
fi

echo
echo "== containers =="
docker compose ps

echo
echo "== api health =="
docker compose exec -T api node -e 'fetch("http://127.0.0.1:3320/api/health").then(async (r) => { const t = await r.text(); if (!r.ok) { process.stderr.write(t + "\n"); process.exit(1); } process.stdout.write(t + "\n"); }).catch((e) => { process.stderr.write(String(e.message || e) + "\n"); process.exit(1); });'

echo
echo "== web probe =="
docker compose exec -T web node -e 'fetch("http://127.0.0.1:5173").then(async (r) => { const t = await r.text(); if (!r.ok) { process.stderr.write("web not reachable\n"); process.exit(1); } const ok = t.includes("<!doctype html>") || t.includes("<!DOCTYPE html>"); process.stdout.write(ok ? "web: ok\n" : "web: unexpected response\n"); if (!ok) process.exit(1); }).catch((e) => { process.stderr.write(String(e.message || e) + "\n"); process.exit(1); });'

echo
echo "== smoke =="
npm run -s monitor:smoke >/tmp/team-task-smoke.log 2>&1 || {
  tail -n 80 /tmp/team-task-smoke.log
  exit 1
}
tail -n 20 /tmp/team-task-smoke.log

echo
echo "status: OK"

#!/usr/bin/env bash
set -euo pipefail

echo "== compose services =="
docker compose ps
echo

echo "== old app health =="
curl -fsS http://127.0.0.1:3310/api/health >/dev/null
echo "ok"
echo

echo "== new api health =="
curl -fsS http://127.0.0.1:3320/api/health >/dev/null
echo "ok"
echo

echo "== web app =="
curl -fsS http://127.0.0.1:5173 >/dev/null
echo "ok"
echo

echo "== monitor ui =="
if curl -fsS http://127.0.0.1:3330 >/dev/null 2>&1; then
  echo "ok"
else
  echo "skipped (run: npm run monitor:ui)"
fi
echo

echo "== openapi and docs =="
curl -fsS http://127.0.0.1:3320/openapi.json >/dev/null
curl -fsSI http://127.0.0.1:3320/docs >/dev/null
echo "ok"
echo

echo "== api smoke =="
bash scripts/smoke.sh
echo

echo "Final check passed."

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env.staging" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.staging
  set +a
fi

WEB_PORT="${WEB_PORT:-5174}"
API_PORT="${API_PORT:-4320}"
APP_PORT="${APP_PORT:-4310}"

echo "== staging compose up =="
WEB_PORT="$WEB_PORT" API_PORT="$API_PORT" APP_PORT="$APP_PORT" docker compose up -d --build

echo "== staging qa seed =="
WEB_PORT="$WEB_PORT" API_PORT="$API_PORT" APP_PORT="$APP_PORT" docker compose --profile staging run --rm qa-seed

echo "== staging smoke =="
OLD_HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health" NEW_API_BASE="http://127.0.0.1:${API_PORT}/api" bash scripts/smoke.sh

echo "Staging environment is ready."

#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/team-task}"
REPO_URL="${REPO_URL:-https://github.com/andreiasenov-bg/team-task.git}"
BRANCH="${BRANCH:-main}"

if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f .env.docker ]; then
  cp .env.docker.example .env.docker
  echo "Created .env.docker from template. Edit secrets before next deploy."
fi

docker compose up -d --build
docker compose ps

echo "--- API health ---"
curl -fsS http://127.0.0.1:3320/api/health || true
echo
echo "Deploy finished."


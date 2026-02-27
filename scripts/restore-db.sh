#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: bash scripts/restore-db.sh <backup-file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Restoring from: $BACKUP_FILE"
docker compose exec -T postgres psql -U teamtask -d teamtask -c "drop schema public cascade; create schema public;"
gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U teamtask -d teamtask
echo "Restore complete."

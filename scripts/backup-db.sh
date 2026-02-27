#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/teamtask-$TS.sql.gz"

echo "Creating backup: $OUT_FILE"
docker compose exec -T postgres pg_dump -U teamtask -d teamtask | gzip > "$OUT_FILE"
echo "Backup complete: $OUT_FILE"

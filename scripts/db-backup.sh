#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[db-backup] DATABASE_URL is required" >&2
  exit 1
fi

mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_FILE:-./backups/flipform-${TS}.dump}"

echo "[db-backup] creating backup at ${OUT_FILE}"
pg_dump --format=custom --no-owner --no-privileges --file "${OUT_FILE}" "${DATABASE_URL}"

echo "[db-backup] done"

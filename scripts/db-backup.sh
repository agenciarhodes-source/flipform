#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_FILE:-backups/flipform-backup-${TS}.dump}"

echo "Backup started..."
pg_dump --format=custom --no-owner --no-privileges --file "${OUT_FILE}" "${DATABASE_URL}"
echo "Backup written to ${OUT_FILE}"
echo "Backup completed."

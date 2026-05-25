#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

BACKUP_FILE="${1:-${BACKUP_FILE:-}}"
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Backup file path is required. Usage: npm run db:restore -- <backup-file>." >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ "${NODE_ENV:-}" == "production" || "${VERCEL_ENV:-}" == "production" ]]; then
  if [[ "${ALLOW_PRODUCTION_RESTORE:-}" != "true" ]]; then
    echo "Refusing to restore into production without ALLOW_PRODUCTION_RESTORE=true" >&2
    exit 1
  fi
fi

if [[ "${CONFIRM_RESTORE:-}" != "true" ]]; then
  echo "Set CONFIRM_RESTORE=true to confirm restore." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required but was not found in PATH." >&2
  exit 1
fi

echo "Restore started from ${BACKUP_FILE}..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${DATABASE_URL}" "${BACKUP_FILE}"
echo "Restore completed."

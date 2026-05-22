#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[db-restore] DATABASE_URL is required" >&2
  exit 1
fi
if [[ -z "${BACKUP_FILE:-}" ]]; then
  echo "[db-restore] BACKUP_FILE is required" >&2
  exit 1
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[db-restore] backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "[db-restore] set CONFIRM_RESTORE=YES to continue" >&2
  exit 1
fi
if [[ "${DATABASE_URL}" == *"prod"* || "${DATABASE_URL}" == *"production"* ]]; then
  if [[ "${ALLOW_PROD_RESTORE:-}" != "YES" ]]; then
    echo "[db-restore] production-like DATABASE_URL detected; set ALLOW_PROD_RESTORE=YES" >&2
    exit 1
  fi
fi

echo "[db-restore] restoring from ${BACKUP_FILE}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${DATABASE_URL}" "${BACKUP_FILE}"

echo "[db-restore] done"

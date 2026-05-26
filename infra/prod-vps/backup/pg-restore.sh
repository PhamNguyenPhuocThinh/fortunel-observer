#!/usr/bin/env bash
#
# pg-restore.sh - restore an encrypted backup into a target Postgres.
#
# Usage:
#   pg-restore.sh <YYYY-MM-DD> [target_container] [target_db]
#
# Defaults: restore into fortunel-postgres:platform (DANGER in prod).
# For drills, start a scratch postgres container and pass its name + db.
#
# Requirements:
#   - rclone with R2 remote configured.
#   - age, with private key at ~/.config/age/keys.txt (NOT on the prod VPS).
#
# This script is meant to run on the operator's local machine or a
# scratch VPS for restore drills. Do not put age private keys on prod.

set -euo pipefail

DATE="${1:?usage: $0 <YYYY-MM-DD> [target_container] [target_db]}"
TARGET_CONTAINER="${2:-fortunel-postgres}"
TARGET_DB="${3:-platform}"

: "${R2_REMOTE:=r2}"
: "${R2_BUCKET:=fortunel-backups}"
: "${AGE_KEY_FILE:=$HOME/.config/age/keys.txt}"
HOSTNAME_FILTER="${HOSTNAME_FILTER:-}"

if [[ ! -r "$AGE_KEY_FILE" ]]; then
  echo "ERROR: age key not found at $AGE_KEY_FILE" >&2
  exit 1
fi

# Find the latest backup for the date (any hostname prefix unless filtered).
PATTERN="*-${TARGET_DB}-${DATE}.sql.gz.age"
[[ -n "$HOSTNAME_FILTER" ]] && PATTERN="${HOSTNAME_FILTER}-${TARGET_DB}-${DATE}.sql.gz.age"

REMOTE_FILE=$(rclone lsf "${R2_REMOTE}:${R2_BUCKET}/" --include "$PATTERN" | sort | tail -n 1)

if [[ -z "$REMOTE_FILE" ]]; then
  echo "ERROR: no backup matching $PATTERN in ${R2_REMOTE}:${R2_BUCKET}/" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "downloading ${REMOTE_FILE}..."
rclone copyto "${R2_REMOTE}:${R2_BUCKET}/${REMOTE_FILE}" "${TMP}/${REMOTE_FILE}"

echo "decrypting..."
age -d -i "$AGE_KEY_FILE" "${TMP}/${REMOTE_FILE}" | gunzip > "${TMP}/restore.sql"

LINES=$(wc -l < "${TMP}/restore.sql")
echo "restore.sql: $LINES lines"

# Final guard: do not blow away prod without explicit confirmation.
if [[ "$TARGET_CONTAINER" == "fortunel-postgres" && "${ALLOW_PROD_RESTORE:-0}" != "1" ]]; then
  echo "REFUSING to restore into prod container without ALLOW_PROD_RESTORE=1" >&2
  exit 1
fi

echo "restoring into ${TARGET_CONTAINER}:${TARGET_DB}..."
docker exec -i "$TARGET_CONTAINER" psql -U postgres -d "$TARGET_DB" < "${TMP}/restore.sql"
echo "restore complete"

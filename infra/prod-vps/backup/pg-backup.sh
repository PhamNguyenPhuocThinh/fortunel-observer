#!/usr/bin/env bash
#
# pg-backup.sh - daily encrypted Postgres backup to Cloudflare R2.
#
# Cron entry (run as the fortunel user):
#   0 3 * * * /home/fortunel/fortunel/infra/prod-vps/backup/pg-backup.sh \
#             >> /var/log/pg-backup.log 2>&1
#
# Requirements on the VPS:
#   - docker (postgres container running as defined in docker-compose.yml)
#   - age      (sudo apt install age)
#   - rclone   (https://rclone.org/install/, configured remote named "r2")
#
# Encryption: backups are encrypted with age using only the recipient's
# PUBLIC key. The private key lives on a separate, offline machine -
# the VPS itself cannot decrypt its own backups. This means a VPS
# compromise does not compromise historical backups.
#
# Restore steps: see ../README.md.

set -euo pipefail

# --- Config ------------------------------------------------------------------
# Override via env if needed (e.g. /etc/fortunel/backup.env sourced by cron).
: "${PG_CONTAINER:=fortunel-postgres}"
: "${PG_USER:=postgres}"
: "${PG_DB:=platform}"
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY is required (age recipient string)}"
: "${R2_REMOTE:=r2}"
: "${R2_BUCKET:=fortunel-backups}"
: "${LOCAL_TMP:=/var/lib/fortunel/backups}"
: "${RETENTION_LOCAL_DAYS:=7}"

DATE=$(date -u +%Y-%m-%d)
HOSTNAME=$(hostname -s)
LABEL="${HOSTNAME}-${PG_DB}-${DATE}"
LOCAL_FILE="${LOCAL_TMP}/${LABEL}.sql.gz.age"
REMOTE_PATH="${R2_REMOTE}:${R2_BUCKET}/${LABEL}.sql.gz.age"

mkdir -p "$LOCAL_TMP"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# --- Backup ------------------------------------------------------------------
log "backup start: $LABEL"

# pg_dump | gzip | age -> file
docker exec -i "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --clean --if-exists \
  | gzip -9 \
  | age -r "$AGE_PUBLIC_KEY" -o "$LOCAL_FILE"

SIZE=$(stat -c%s "$LOCAL_FILE")
log "encrypted dump: ${LOCAL_FILE} (${SIZE} bytes)"

# Sanity check: refuse to upload anything suspiciously small.
if [[ "$SIZE" -lt 1024 ]]; then
  log "ERROR backup too small ($SIZE bytes); aborting"
  exit 1
fi

# --- Upload ------------------------------------------------------------------
log "uploading to $REMOTE_PATH"
rclone copyto "$LOCAL_FILE" "$REMOTE_PATH" --checksum --s3-no-check-bucket
log "upload ok"

# --- Local rotation ----------------------------------------------------------
find "$LOCAL_TMP" -name "${HOSTNAME}-${PG_DB}-*.sql.gz.age" \
  -type f -mtime "+${RETENTION_LOCAL_DAYS}" -delete -print | \
  sed 's/^/[rotate] removed /'

log "backup done: $LABEL"

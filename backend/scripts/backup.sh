#!/bin/bash
# Ultrasound diagnosis backend backup script.
#
# Backs up the SQLite database (consistently via `.backup`) and the uploads
# directory (incremental rsync with hardlinks). Run daily via cron:
#
#   0 3 * * * /opt/ultrasound/backend/scripts/backup.sh >> /var/log/ultrasound-backup.log 2>&1
#
# Override destination with BACKUP_DIR=... Retention is 30 days.

set -euo pipefail

cd "$(dirname "$0")/.."

DATE="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ultrasound}"
mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] backing up to ${BACKUP_DIR}"

if [ -f data/app.db ]; then
    sqlite3 data/app.db ".backup ${BACKUP_DIR}/app-${DATE}.db"
    echo "  - db snapshot: app-${DATE}.db"
fi

if [ -d data/uploads ]; then
    LINK_DEST=""
    if [ -L "${BACKUP_DIR}/uploads-latest" ] && [ -d "${BACKUP_DIR}/uploads-latest" ]; then
        LINK_DEST="--link-dest=${BACKUP_DIR}/uploads-latest"
    fi
    rsync -a ${LINK_DEST} data/uploads/ "${BACKUP_DIR}/uploads-${DATE}/"
    ln -sfn "${BACKUP_DIR}/uploads-${DATE}" "${BACKUP_DIR}/uploads-latest"
    echo "  - uploads snapshot: uploads-${DATE}/"
fi

# Retention: delete db dumps older than 30 days and uploads snapshots older
# than 30 days (but keep uploads-latest symlink regardless).
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'app-*.db' -mtime +30 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -maxdepth 1 -type d -name 'uploads-*' ! -name 'uploads-latest' -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "[$(date -Iseconds)] done."

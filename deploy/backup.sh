#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
backup_dir="${BACKUP_DIR:-$HOME/backups/trailcam-planner}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
umask 077
backup_file="$backup_dir/presets-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
trap 'rm -f "$backup_file.tmp"' EXIT
docker compose exec -T trailcam python - <<'PY' > "$backup_file.tmp"
import os, sqlite3, sys, tempfile
with tempfile.TemporaryDirectory() as directory:
    path = directory + '/snapshot.sqlite3'
    with sqlite3.connect(os.environ['DATABASE_PATH']) as source, sqlite3.connect(path) as target:
        source.backup(target)
    with open(path, 'rb') as snapshot:
        sys.stdout.buffer.write(snapshot.read())
PY
mv "$backup_file.tmp" "$backup_file"
printf '%s\n' "$backup_file"

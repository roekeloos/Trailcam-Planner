# Trailcam Planner

Trail camera storage calculator with named presets and side-by-side comparisons.
Live site: https://trailcam-planner.darlingdev.dev

The calculator is public. Presets are private to a browser through a random,
HttpOnly, Secure, SameSite cookie. There are no accounts or cross-device sync.
Clearing cookies loses access to that browser's collection. Calculator drafts
and the original single baseline continue to use local storage. Saving a named
preset is always explicit; comparisons use the existing pure calculation module.

Presets contain all settings, including file sizes, Hybrid/timelapse capture
behaviour, and independent motion rates. Select two or more presets to compare
photos/day, videos/day, storage/day, and storage-limited runtime. Load restores
the full form; Delete removes the snapshot. Names may repeat.

## Local use

Requires Python 3.14; no packages or build step:

```sh
python3 server.py
```

Open http://127.0.0.1:8080. Settings: `PORT`, `PUBLIC_ORIGIN` (must match the
browser origin), and `DATABASE_PATH` (defaults to `data/presets.sqlite3`).
Only the four calculator files are served; the database is outside the web root.
The API validates complete settings, rejects cross-origin writes, and scopes
reads and writes to the browser. Limits: 100 presets/browser, 10,000 total,
80 characters/name, 16 KiB/request. Lost browser cookies cannot be recovered
through the UI; treat the cookie as the key to a collection.

## VPS deployment

Host: SSH alias `rjd-vps-deploy`. App directory:
`/home/deploy/apps/trailcam-planner`. Existing shared Caddy:
`/opt/hyto/Caddyfile` in `hyto-caddy-1`; Docker network `hyto_default`.

Copy the committed release to the app directory, then run:

```sh
RELEASE=<commit> docker compose up -d --build --wait
```

Merge `deploy/Caddyfile` into the shared Caddyfile once, preserving other site
blocks. Validate and reload without restarting the other applications:

```sh
docker exec hyto-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec hyto-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Caddy terminates HTTPS and redirects HTTP. The app has no published host port.
SQLite lives in Docker volume `trailcam-planner_presets`, mounted at `/data`,
and survives rebuilds and restarts. Do not remove the volume on redeployment.
Images are tagged with the release commit; to roll back, select an older image
with `RELEASE=<old-commit> docker compose up -d --no-build`.

## Backups

Run `./deploy/backup.sh` on the VPS. It uses SQLite's online backup API and writes
an owner-only snapshot to `/home/deploy/backups/trailcam-planner/` (override with
`BACKUP_DIR`). A user systemd timer runs daily at 00:30 UTC / 02:30 South Africa time.
Install `deploy/trailcam-backup.service` and `deploy/trailcam-backup.timer`
under `~/.config/systemd/user/`, then enable `trailcam-backup.timer` using
`systemctl --user enable --now`. User lingering is enabled for `deploy` so
backups run after logout and reboot.
Backups remain on the VPS; off-site copies and retention are not configured.
Restore with the app stopped, copying a snapshot into the volume as
`presets.sqlite3`, removing old `-wal`/`-shm` files, and retaining UID 10001
ownership. Existing cookies are needed to access restored browser collections.

## Verification

```sh
python3 -m unittest discover -s tests -v
node --test tests/calculate.test.mjs
```

API checks cover save, full reload, restart persistence, owner isolation,
validation, cross-origin rejection, deletion, backup contents, and module MIME
types. Browser acceptance covers live forecast changes, independent Hybrid
rates, file-size restore, multi-preset comparisons, browser isolation, and mobile
layout. Original archive instructions: `docs/original-handoff.md`.

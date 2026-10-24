#!/usr/bin/env bash
# Back up OpenMAIC (source, Postgres, app data volume, env/secrets) into a private GitHub repo.
# Runs on the VPS from cron. Everything that can hold user data or secrets is encrypted with
# `age` to a PUBLIC key, so the VPS (and the repo) never holds the key that opens it.
#
#   backup.sh            full run: dump, encrypt, commit, push
#   PUSH=0 backup.sh     everything except the push (for tests)
set -euo pipefail

APP_DIR=${APP_DIR:-$HOME/OpenMAIC}
BACKUP_HOME=${BACKUP_HOME:-$HOME/backup}
REPO_DIR=${REPO_DIR:-$BACKUP_HOME/repo}
REMOTE=${REMOTE:-git@github-backup:nqthiep/khaitam.ai.vn.git}
RECIPIENT_FILE=${RECIPIENT_FILE:-$BACKUP_HOME/age-recipient.txt}
PUSH=${PUSH:-1}
MAX_FILE_BYTES=$((95 * 1024 * 1024)) # GitHub rejects files over 100 MB

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

exec 9>"$BACKUP_HOME/.lock"
flock -n 9 || { log "another backup is running, skipping"; exit 0; }

[ -s "$RECIPIENT_FILE" ] || { log "missing age public key: $RECIPIENT_FILE"; exit 1; }
cd "$APP_DIR"
COMPOSE="docker compose"
enc() { age -R "$RECIPIENT_FILE" -o "$1.tmp" && mv "$1.tmp" "$1"; }

if [ ! -d "$REPO_DIR/.git" ]; then
  git clone -q "$REMOTE" "$REPO_DIR" 2>/dev/null || { git init -q "$REPO_DIR"; git -C "$REPO_DIR" remote add origin "$REMOTE"; }
  git -C "$REPO_DIR" checkout -q -B main
  git -C "$REPO_DIR" config user.name "khaitam-backup"
  git -C "$REPO_DIR" config user.email "backup@khaitam.ai.vn"
fi
mkdir -p "$REPO_DIR"/{db,data,secrets,source}

log "database"
$COMPOSE exec -T postgres pg_dump -U openmaic -d openmaic -Fc | enc "$REPO_DIR/db/openmaic.dump.age"

log "app data volume (classrooms, jobs, uploads)"
$COMPOSE exec -T openmaic tar -C /app/data -czf - . | enc "$REPO_DIR/data/app-data.tar.gz.age"

log "env and server-only config"
tar -C "$APP_DIR" -czf - .env .env.local docker-compose.override.yml | enc "$REPO_DIR/secrets/env-and-config.tar.gz.age"

log "source"
# Plain on purpose: git then stores only the files that changed. Secrets are excluded here and
# live in secrets/ above.
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude docker-compose.override.yml \
  "$APP_DIR/" "$REPO_DIR/source/"

cp "$APP_DIR/ops/backup/RESTORE.md" "$REPO_DIR/README.md" 2>/dev/null || true
{
  echo "time_utc: $(date -u +%FT%TZ)"
  echo "host: $(hostname)"
  echo "app_commit: $(git -C "$APP_DIR" rev-parse HEAD)"
  echo "app_uncommitted_files: $(git -C "$APP_DIR" status --porcelain | wc -l | tr -d ' ')"
  (cd "$REPO_DIR" && sha256sum db/*.age data/*.age secrets/*.age)
} > "$REPO_DIR/MANIFEST.txt"

big=$(find "$REPO_DIR" -path "$REPO_DIR/.git" -prune -o -type f -size +"${MAX_FILE_BYTES}c" -print | head -1)
[ -z "$big" ] || { log "refusing to commit, over GitHub's 100 MB file limit: $big"; exit 1; }

cd "$REPO_DIR"
git add -A
git commit -q -m "backup $(date -u +%FT%TZ)"
log "committed $(git rev-parse --short HEAD); repo .git is $(du -sh .git | cut -f1)"
if [ "$PUSH" = 1 ]; then
  for i in 1 2 3; do git push -q origin main && { log "pushed"; exit 0; }; sleep $((i * 20)); done
  log "push failed after 3 tries"; exit 1
fi
log "PUSH=0, not pushed"

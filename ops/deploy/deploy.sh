#!/usr/bin/env bash
# Deploy the app on the server from the image GitHub built (.github/workflows/build-image.yml).
#
#   ops/deploy/deploy.sh             latest commit of the branch: git pull, then the image of that commit
#   ops/deploy/deploy.sh sha-1a2b3c4 a given version (a rollback to an older one, for example)
#   DRY_RUN=1 ops/deploy/deploy.sh   print what would happen, change nothing
#   SKIP_GIT=1 ops/deploy/deploy.sh  do not git pull (use the checkout as it is)
#
# In order: checks, database backup, pull the image, restart only the app, wait for it to answer,
# and if it does not, put the previous version back. The database and the other services are not
# touched. Run it on the server, in the folder of the checkout (it finds the folder itself).
set -euo pipefail

APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
KEEP_BACKUPS=${KEEP_BACKUPS:-10}
KEEP_IMAGES=${KEEP_IMAGES:-3}
PORT=${OPENMAIC_PORT:-3000}
WAIT_SECONDS=${WAIT_SECONDS:-180}
MIN_FREE_MB=${MIN_FREE_MB:-1500}
IMAGE=ghcr.io/nqthiep/openmaic
DRY_RUN=${DRY_RUN:-0}
SKIP_GIT=${SKIP_GIT:-0}

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.image.yml)

log() { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "LỖI: $*"; exit 1; }
# Everything that changes something goes through run, so DRY_RUN=1 can show it instead.
run() {
  if [ "$DRY_RUN" = 1 ]; then log "[thử] $*"; else "$@"; fi
}

cd "$APP_DIR"
[ -f docker-compose.image.yml ] || die "không thấy docker-compose.image.yml trong $APP_DIR (chưa git pull nhánh mới?)"

# One deploy at a time.
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.deploy.lock"
flock -n 9 || die "một lần deploy khác đang chạy"

# ---- 1. Checks ---------------------------------------------------------------------------------
[ "$(uname -m)" = x86_64 ] || die "máy này là $(uname -m); image được build cho x86-64 (linux/amd64)"
command -v docker >/dev/null || die "chưa cài docker"
free_mb=$(df -Pm "$APP_DIR" | awk 'NR==2{print $4}')
[ "$free_mb" -ge "$MIN_FREE_MB" ] || die "ổ đĩa còn ${free_mb} MB, cần ít nhất ${MIN_FREE_MB} MB (chạy: docker image prune -a)"
[ -f .env.local ] || log "lưu ý: không có .env.local (khoá bí mật, PROVIDER_SECRET_KEY) - kiểm tra trước khi tiếp tục"

# ---- 2. Which version -------------------------------------------------------------------------
if [ "$SKIP_GIT" != 1 ]; then
  log "git pull"
  run git pull --ff-only
fi
full_sha=$(git rev-parse HEAD)
TAG=${1:-sha-${full_sha:0:7}} # the workflow tags images with the first 7 characters of the commit
export OPENMAIC_IMAGE_TAG=$TAG
log "phiên bản sẽ chạy: $IMAGE:$TAG  (commit $(git rev-parse --short HEAD))"

# What runs now, so it can be put back. A locally built image has no tag to return to, so it gets one.
current_id=
if cid=$("${COMPOSE[@]}" ps -q openmaic 2>/dev/null) && [ -n "$cid" ]; then
  current_id=$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true)
fi
if [ -n "$current_id" ]; then
  run docker tag "$current_id" "$IMAGE:rollback"
  log "bản đang chạy được giữ lại để quay lui: $IMAGE:rollback"
else
  log "không thấy bản đang chạy (lần đầu?) - không có gì để quay lui"
fi

# ---- 3. Database backup (before anything changes) -----------------------------------------------
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$BACKUP_DIR/pre-deploy-$stamp.sql.gz"
log "sao lưu cơ sở dữ liệu -> $dump"
if [ "$DRY_RUN" = 1 ]; then
  log "[thử] pg_dump | gzip > $dump"
else
  "${COMPOSE[@]}" exec -T postgres pg_dump -U openmaic -d openmaic | gzip > "$dump" \
    || die "sao lưu thất bại - không deploy"
  gzip -t "$dump" || die "file sao lưu hỏng - không deploy"
  [ "$(stat -c %s "$dump")" -gt 1000 ] || die "file sao lưu quá nhỏ - không deploy"
  # Only the newest KEEP_BACKUPS stay.
  ls -1t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f --
fi

# ---- 4. Pull the image ----------------------------------------------------------------------------
log "tải image"
if ! run "${COMPOSE[@]}" pull openmaic; then
  die "không tải được $IMAGE:$TAG. Kiểm tra: (1) workflow 'Build image' trên GitHub đã chạy xong chưa; (2) package trên GitHub đã để Public chưa (xem ops/deploy/README.md)"
fi

# ---- 5. Restart only the app ----------------------------------------------------------------------
log "khởi động lại ứng dụng"
run "${COMPOSE[@]}" up -d --no-build openmaic

healthy() {
  local deadline=$((SECONDS + WAIT_SECONDS))
  while [ $SECONDS -lt $deadline ]; do
    if [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)" = 200 ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if [ "$DRY_RUN" = 1 ]; then
  log "[thử] đợi tối đa ${WAIT_SECONDS}s cho http://127.0.0.1:$PORT/api/health trả 200"
  log "xong (chế độ thử, không thay đổi gì)"
  exit 0
fi

log "chờ ứng dụng trả lời (tối đa ${WAIT_SECONDS}s)"
if healthy; then
  log "ứng dụng đang chạy: $IMAGE:$TAG"
else
  log "ứng dụng KHÔNG trả lời. 40 dòng log cuối:"
  "${COMPOSE[@]}" logs --tail 40 openmaic || true
  if [ -n "$current_id" ]; then
    log "quay lại bản trước"
    OPENMAIC_IMAGE_TAG=rollback "${COMPOSE[@]}" up -d --no-build openmaic
    if healthy; then
      die "đã quay lại bản trước và nó chạy bình thường. Bản mới ($TAG) lỗi, xem log ở trên. Cơ sở dữ liệu đã sao lưu: $dump"
    fi
    die "bản trước cũng không lên. Cần xem tay. Cơ sở dữ liệu đã sao lưu: $dump"
  fi
  die "không có bản trước để quay lại. Cơ sở dữ liệu đã sao lưu: $dump"
fi

# ---- 6. Clean up --------------------------------------------------------------------------------------
# Old version images pile up and the disk is small: keep the newest few (never one in use).
docker image ls "$IMAGE" --format '{{.Tag}}' | grep '^sha-' | tail -n +"$((KEEP_IMAGES + 1))" |
  while read -r old; do docker rmi "$IMAGE:$old" >/dev/null 2>&1 || true; done
docker image prune -f >/dev/null 2>&1 || true

log "xong. Bản sao lưu: $dump"
log "để quay lại bản cũ: ops/deploy/deploy.sh sha-<commit cũ>"

#!/usr/bin/env bash
set -euo pipefail

TARGET_SHA="${1:-}"
if [[ -z "$TARGET_SHA" ]]; then
  echo "Usage: deploy.sh <git-sha>"
  exit 1
fi

APP_DIR="/srv/halal-economy-bot"
REPO_DIR="$APP_DIR/repo"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"
PREVIOUS_LINK="$APP_DIR/previous"
SHARED_DIR="$APP_DIR/shared"
SERVICE_NAME="halal-economy-bot.service"

RELEASE_DIR="$RELEASES_DIR/$TARGET_SHA"
SWITCHED=0

rollback() {
  if [[ "$SWITCHED" -ne 1 ]]; then
    return
  fi

  if [[ -L "$PREVIOUS_LINK" ]]; then
    PREVIOUS_TARGET="$(readlink -f "$PREVIOUS_LINK")"
    if [[ -n "$PREVIOUS_TARGET" ]]; then
      echo "Rolling back to previous release: $PREVIOUS_TARGET"
      ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
      systemctl restart "$SERVICE_NAME" || true
    fi
  fi
}

trap rollback ERR

mkdir -p "$RELEASES_DIR" "$SHARED_DIR/data"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Missing repo checkout at $REPO_DIR"
  exit 1
fi

echo "Fetching target SHA $TARGET_SHA"
git -C "$REPO_DIR" fetch --depth=1 origin "$TARGET_SHA"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Extracting release into $RELEASE_DIR"
git -C "$REPO_DIR" archive "$TARGET_SHA" | tar -x -C "$RELEASE_DIR"

if [[ -f "$SHARED_DIR/.env" ]]; then
  ln -sfn "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
fi

ln -sfn "$SHARED_DIR/data" "$RELEASE_DIR/data"

pushd "$RELEASE_DIR" >/dev/null

echo "Installing dependencies"
pnpm install --frozen-lockfile

echo "Building"
pnpm build

echo "Running smoke check"
pnpm smoke-check

popd >/dev/null

echo "Installing botctl"
install -m 0755 "$RELEASE_DIR/deploy/botctl" /usr/local/bin/botctl

echo "Installing nightly backup cron"
install -m 0644 "$RELEASE_DIR/deploy/halal-economy-backup.cron" /etc/cron.d/halal-economy-backup

if [[ -L "$CURRENT_LINK" ]]; then
  ln -sfn "$(readlink -f "$CURRENT_LINK")" "$PREVIOUS_LINK"
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
SWITCHED=1

echo "Restarting $SERVICE_NAME"
DEPLOY_STARTED_AT="$(date '+%Y-%m-%d %H:%M:%S')"
systemctl restart "$SERVICE_NAME"

echo "Waiting for service to stabilize (up to 30s)..."
for i in $(seq 1 15); do
  sleep 2
  STATE="$(systemctl is-active "$SERVICE_NAME" || true)"
  if [[ "$STATE" == "failed" ]]; then
    break
  fi
  echo "  [$((i * 2))s] service is $STATE"
done

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "Service failed after restart — recent logs:"
  journalctl -u "$SERVICE_NAME" --since "$DEPLOY_STARTED_AT" -n 25 --no-pager || true
  exit 1
fi

if journalctl -u "$SERVICE_NAME" --since "$DEPLOY_STARTED_AT" -p err --no-pager | grep -q .; then
  echo "WARNING: error-level logs during startup:"
  journalctl -u "$SERVICE_NAME" --since "$DEPLOY_STARTED_AT" -p err --no-pager || true
fi

echo "Pruning old releases (keeping newest 4)"
ls -1t "$RELEASES_DIR" | tail -n +5 | while read -r OLD; do
  if [[ "$RELEASES_DIR/$OLD" != "$(readlink -f "$CURRENT_LINK")" && "$RELEASES_DIR/$OLD" != "$(readlink -f "$PREVIOUS_LINK" 2>/dev/null || true)" ]]; then
    echo "  removing $OLD"
    rm -rf "${RELEASES_DIR:?}/$OLD"
  fi
done

echo "Deployment successful: $TARGET_SHA"

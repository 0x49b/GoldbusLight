#!/usr/bin/env bash
# Download a published release of GoldbusLight from GitHub by tag and install it
# in-place over the existing Raspberry Pi installation.
#
# Usage:
#   sudo ./install-release.sh v0.0.19
#   sudo GOLDBUS_USER=pi GOLDBUS_INSTALL_DIR=/opt/goldbuslight ./install-release.sh v0.0.19
#
# Defaults assume the layout produced by install-raspberry-pi.sh:
#   - install dir: /opt/goldbuslight
#   - run user:    pi
#   - service:     user-mode systemd unit (goldbuslight.service)
#
# Asset published per release on https://github.com/0x49b/GoldbusLight/releases
# is `GoldbusLight-linux-arm64` (Raspberry Pi OS 64-bit). Other architectures
# are not built in CI.

set -euo pipefail

REPO="${GOLDBUS_REPO:-0x49b/GoldbusLight}"
ASSET="${GOLDBUS_ASSET:-GoldbusLight-linux-arm64}"
INSTALL_DIR="${GOLDBUS_INSTALL_DIR:-/opt/goldbuslight}"
RUN_USER="${GOLDBUS_USER:-pi}"
SERVICE_MODE="${GOLDBUS_SERVICE_MODE:-user}" # user|system

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

usage() {
  sed -n '1,18p' "$0"
}

TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)         RUN_USER="${2:?}"; shift 2 ;;
    --install-dir)  INSTALL_DIR="${2:?}"; shift 2 ;;
    --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
    --asset)        ASSET="${2:?}"; shift 2 ;;
    --repo)         REPO="${2:?}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "unknown flag: $1" ;;
    *)
      [[ -z "$TAG" ]] || die "unexpected extra argument: $1"
      TAG="$1"
      shift
      ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"
[[ -n "$TAG" ]] || { usage; exit 1; }
[[ "$SERVICE_MODE" == "user" || "$SERVICE_MODE" == "system" ]] || die "--service-mode must be user or system"
id -u "$RUN_USER" >/dev/null 2>&1 || die "unix user does not exist: $RUN_USER"
[[ -d "$INSTALL_DIR" ]] || die "install dir not found: $INSTALL_DIR (run install-raspberry-pi.sh first)"

# Normalise tag: accept "0.0.19", "v0.0.19", "V0.0.19".
case "$TAG" in
  v*|V*) ;;
  *) TAG="v$TAG" ;;
esac

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
APP_BIN="$INSTALL_DIR/GoldbusLight"
TMP_DIR="$(mktemp -d -t goldbuslight-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_BIN="$TMP_DIR/$ASSET"

command -v curl >/dev/null 2>&1 || die "curl is required"

log "Downloading $TAG ($ASSET) from $REPO"
HTTP_STATUS="$(curl -fL --retry 3 --connect-timeout 15 -w '%{http_code}' -o "$TMP_BIN" "$URL" 2>/dev/null || true)"
if [[ ! -s "$TMP_BIN" ]]; then
  die "download failed (HTTP $HTTP_STATUS) — check tag exists and asset name: $URL"
fi

# Best-effort sanity check: must be an executable, must be ELF arm64.
file "$TMP_BIN" 2>/dev/null | grep -qE 'ELF.*aarch64|ELF.*ARM aarch64' || \
  log "warning: downloaded asset is not aarch64 ELF (continuing anyway)"

DOWNLOADED_VERSION="$(strings "$TMP_BIN" 2>/dev/null | grep -m1 -E '^[0-9]+\.[0-9]+\.[0-9]+' || true)"
[[ -n "$DOWNLOADED_VERSION" ]] && log "Asset reports version: $DOWNLOADED_VERSION"

log "Stopping GoldbusLight"
if [[ "$SERVICE_MODE" == "user" ]]; then
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUN_USER")" \
    systemctl --user stop goldbuslight.service 2>/dev/null || true
else
  systemctl stop goldbuslight.service 2>/dev/null || true
fi
pkill -u "$RUN_USER" -f "$APP_BIN" 2>/dev/null || true

# Wait briefly for the file to be released.
for _ in 1 2 3 4 5; do
  if ! pgrep -u "$RUN_USER" -f "$APP_BIN" >/dev/null 2>&1; then break; fi
  sleep 1
done

log "Installing new binary -> $APP_BIN"
# Keep one rollback copy. Atomic rename so partial copies never run.
[[ -f "$APP_BIN" ]] && cp -f "$APP_BIN" "$APP_BIN.previous"
install -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$TMP_BIN" "$APP_BIN.new"
mv -f "$APP_BIN.new" "$APP_BIN"

log "Starting GoldbusLight"
if [[ "$SERVICE_MODE" == "user" ]]; then
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUN_USER")" \
    systemctl --user start goldbuslight.service
else
  systemctl start goldbuslight.service
fi

log "Done. Installed $TAG to $INSTALL_DIR (rollback: $APP_BIN.previous)"

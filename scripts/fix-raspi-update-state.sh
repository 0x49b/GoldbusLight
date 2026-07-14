#!/usr/bin/env bash
set -euo pipefail

# GoldbusLight recovery/fix script for Raspberry Pi install layout
# - Fixes updater write permissions
# - Removes stale .old/.new files from failed updates
# - Recreates menu launcher
# - Restarts service (user or system mode)

INSTALL_DIR="${GOLDBUS_INSTALL_DIR:-/opt/goldbuslight}"
RUN_USER="${GOLDBUS_USER:-pi}"
SERVICE_MODE="${GOLDBUS_SERVICE_MODE:-user}" # user|system
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPICON_SRC="$SCRIPT_DIR/../build/appicon.png"

die() { echo "error: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"
id -u "$RUN_USER" >/dev/null 2>&1 || die "user does not exist: $RUN_USER"
[[ -d "$INSTALL_DIR" ]] || die "install dir not found: $INSTALL_DIR"
[[ "$SERVICE_MODE" == "user" || "$SERVICE_MODE" == "system" ]] || die "GOLDBUS_SERVICE_MODE must be user or system"

RUN_HOME="$(eval echo "~$RUN_USER")"
APP_BIN="$INSTALL_DIR/GoldbusLight"
APP_BAK="$APP_BIN.bak"
LAUNCH_SH="$INSTALL_DIR/launch.sh"
ICON_FILE="$INSTALL_DIR/goldbuslight.png"

echo "==> Stopping GoldbusLight"
if [[ "$SERVICE_MODE" == "user" ]]; then
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUN_USER")" \
    systemctl --user stop goldbuslight.service || true
else
  systemctl stop goldbuslight.service || true
fi
pkill -u "$RUN_USER" -f GoldbusLight || true
sleep 1

echo "==> Fixing ownership/permissions for self-update"
# Updater must be able to write .GoldbusLight.new and rename binaries in INSTALL_DIR
chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"
chmod 0755 "$INSTALL_DIR"
[[ -f "$APP_BIN" ]] && chmod 0755 "$APP_BIN"
[[ -f "$LAUNCH_SH" ]] && chmod 0755 "$LAUNCH_SH"

if [[ ! -f "$APP_BIN" && -f "$APP_BAK" ]]; then
  echo "==> Restoring missing binary from failed in-app update backup"
  mv -f "$APP_BAK" "$APP_BIN"
  chmod 0755 "$APP_BIN"
  chown "$RUN_USER:$RUN_USER" "$APP_BIN"
fi

echo "==> Cleaning stale updater temp files"
rm -f "$INSTALL_DIR/.GoldbusLight.new" "$INSTALL_DIR/.GoldbusLight.old"
# Remove leftover .bak only when the main binary is present (successful or restored install).
[[ -f "$APP_BIN" ]] && rm -f "$APP_BAK"

echo "==> Ensuring env file exists"
if [[ ! -f /etc/default/goldbuslight ]]; then
  cat >/etc/default/goldbuslight <<'EOF'
GOLDBUS_FULLSCREEN=1
EOF
  chmod 0644 /etc/default/goldbuslight
fi

echo "==> Installing icon (if available in repo)"
if [[ -f "$APPICON_SRC" ]]; then
  install -m 0644 -o "$RUN_USER" -g "$RUN_USER" "$APPICON_SRC" "$ICON_FILE"
fi

echo "==> Writing system menu entry"
cat >/usr/share/applications/goldbuslight.desktop <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Goldbus Light Controller
Comment=Control WLED lights in the Goldbus
Exec=$LAUNCH_SH
Icon=$ICON_FILE
Terminal=false
Categories=Utility;
StartupNotify=true
EOF
chmod 0644 /usr/share/applications/goldbuslight.desktop

echo "==> Restarting service"
if [[ "$SERVICE_MODE" == "user" ]]; then
  loginctl enable-linger "$RUN_USER" || true
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUN_USER")" \
    systemctl --user daemon-reload
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUN_USER")" \
    systemctl --user enable --now goldbuslight.service
else
  systemctl daemon-reload
  systemctl enable --now goldbuslight.service
fi

echo
echo "Done."
echo "Install dir writable by $RUN_USER and stale updater files removed."
echo "Menu entry: /usr/share/applications/goldbuslight.desktop"
echo "Desktop launcher not managed (menu-only policy)."
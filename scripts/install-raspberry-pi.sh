#!/usr/bin/env bash
# Install GoldbusLight on Raspberry Pi OS (64-bit recommended; matches CI linux-arm64).
# Installs the GUI binary, GTK/WebKit runtime libraries, enables fullscreen via
# GOLDBUS_FULLSCREEN=1 (see main.go), and registers a systemd service.
#
# Usage:
#   sudo ./install-raspberry-pi.sh /path/to/GoldbusLight-linux-arm64
#   sudo GOLDBUS_USER=pi ./install-raspberry-pi.sh ./GoldbusLight-linux-arm64
#
# Prerequisites: download `GoldbusLight-linux-arm64` from a GitHub Release, or build
# on the Pi with `task linux:build ARCH=arm64 DEV=false` and pass bin/GoldbusLight.
#
# After install: reboot. Enable desktop auto-login if the app must start without typing
# a password (raspi-config → System Options → Boot / Auto Login).

set -euo pipefail

INSTALL_DIR="${GOLDBUS_INSTALL_DIR:-/opt/goldbuslight}"
RUN_USER="${GOLDBUS_USER:-pi}"
SERVICE_MODE="${GOLDBUS_SERVICE_MODE:-user}" # user | system

die() { echo "error: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"

BINARY_SRC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      RUN_USER="${2:?}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:?}"
      shift 2
      ;;
    --service-mode)
      SERVICE_MODE="${2:?}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,22p' "$0"
      exit 0
      ;;
    *)
      [[ -z "$BINARY_SRC" ]] || die "unexpected extra argument: $1"
      BINARY_SRC="$1"
      shift
      ;;
  esac
done

[[ -n "$BINARY_SRC" ]] || die "usage: sudo $0 [--user pi] [--install-dir DIR] [--service-mode user|system] /path/to/GoldbusLight-linux-arm64"
[[ -f "$BINARY_SRC" ]] || die "binary not found: $BINARY_SRC"
[[ "$SERVICE_MODE" == user || "$SERVICE_MODE" == system ]] || die "--service-mode must be user or system"

id -u "$RUN_USER" &>/dev/null || die "unix user does not exist: $RUN_USER"

RUN_HOME="$(eval echo "~$RUN_USER")"
[[ -d "$RUN_HOME" ]] || die "home directory missing for $RUN_USER: $RUN_HOME"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  libgtk-3-0 \
  libwebkit2gtk-4.1-0 \
  libayatana-appindicator3-1 \
  xdg-utils

install -d -m 0755 -o root -g root "$INSTALL_DIR"
install -m 0755 -o root -g root "$BINARY_SRC" "$INSTALL_DIR/GoldbusLight"

cat >/etc/default/goldbuslight <<EOF
# GoldbusLight runtime (exported by systemd units below)
GOLDBUS_FULLSCREEN=1
EOF
chmod 0644 /etc/default/goldbuslight

cat >"$INSTALL_DIR/launch.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DISPLAY="\${DISPLAY:-:0}"
export DISPLAY
set -a
# shellcheck source=/dev/null
[[ -f /etc/default/goldbuslight ]] && . /etc/default/goldbuslight
set +a
XN="\${DISPLAY#*:}"
XN="\${XN%%.*}"
X_SOCK="/tmp/.X11-unix/X\${XN}"
for _ in \$(seq 1 120); do
  [[ -S "\$X_SOCK" ]] && break
  sleep 1
done
exec "$INSTALL_DIR/GoldbusLight"
EOF
chmod 0755 "$INSTALL_DIR/launch.sh"
chown root:root "$INSTALL_DIR/launch.sh"

if [[ "$SERVICE_MODE" == user ]]; then
  install -d -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$RUN_HOME/.config/systemd/user"
  cat >"$RUN_HOME/.config/systemd/user/goldbuslight.service" <<EOF
[Unit]
Description=GoldbusLight
After=graphical-session.target network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=-/etc/default/goldbuslight
Environment=DISPLAY=:0
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/launch.sh
Restart=on-failure
RestartSec=4

[Install]
WantedBy=default.target
EOF
  chown "$RUN_USER:$RUN_USER" "$RUN_HOME/.config/systemd/user/goldbuslight.service"
  chmod 0644 "$RUN_HOME/.config/systemd/user/goldbuslight.service"

  loginctl enable-linger "$RUN_USER" || true

  rm -f /etc/systemd/system/goldbuslight.service
  systemctl daemon-reload

  echo "note: after the first graphical login for $RUN_USER, enable the user service with:"
  echo "  sudo -u $RUN_USER XDG_RUNTIME_DIR=/run/user/\$(id -u $RUN_USER) systemctl --user enable --now goldbuslight.service"
else
  cat >/etc/systemd/system/goldbuslight.service <<EOF
[Unit]
Description=GoldbusLight (Wails)
After=network-online.target display-manager.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
EnvironmentFile=-/etc/default/goldbuslight
Environment=DISPLAY=:0
Environment=XAUTHORITY=$RUN_HOME/.Xauthority
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/launch.sh
Restart=on-failure
RestartSec=4

[Install]
WantedBy=graphical.target
EOF
  systemctl daemon-reload
  systemctl enable goldbuslight.service
  rm -f "$RUN_HOME/.config/systemd/user/goldbuslight.service"
fi

echo ""
echo "GoldbusLight installed to $INSTALL_DIR"
echo "Fullscreen: GOLDBUS_FULLSCREEN=1 in /etc/default/goldbuslight (requires rebuild if your binary predates this env support)."
if [[ "$SERVICE_MODE" == user ]]; then
  echo "Linger for $RUN_USER: $(loginctl show-user "$RUN_USER" -p Linger --value 2>/dev/null || echo unknown)"
else
  echo "Enabled system service: goldbuslight.service — use: systemctl start goldbuslight"
fi
echo "Reboot recommended."

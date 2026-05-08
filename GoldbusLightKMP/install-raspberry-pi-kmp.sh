#!/usr/bin/env bash
# Install GoldbusLight KMP on Raspberry Pi OS (64-bit recommended).
# Installs the packaged JVM binary and registers a systemd service.
#
# Prerequisites: 
# Build the native distribution using: 
#   ./gradlew :composeApp:packageDeb 
#
# Usage:
#   sudo ./install-raspberry-pi-kmp.sh

set -euo pipefail

INSTALL_DIR="${GOLDBUS_INSTALL_DIR:-/opt/goldbuslight-kmp}"
RUN_USER="${GOLDBUS_USER:-pi}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "error: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"
id -u "$RUN_USER" &>/dev/null || die "unix user does not exist: $RUN_USER"

RUN_HOME="$(eval echo "~$RUN_USER")"

echo "==> Preparing installation directory..."
install -d -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$INSTALL_DIR"

echo "==> Note: Please ensure you have copied the contents of 'composeApp/build/compose/binaries/main/app' to $INSTALL_DIR"

cat >/etc/default/goldbuslight-kmp <<EOF
# GoldbusLight KMP runtime env
GOLDBUS_FULLSCREEN=1
# Enable Skia GPU acceleration for Compose Desktop on Raspberry Pi
SKIKO_RENDER_API=OPENGL
EOF
chmod 0644 /etc/default/goldbuslight-kmp

cat >"$INSTALL_DIR/launch.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DISPLAY="\${DISPLAY:-:0}"
export DISPLAY
set -a
# shellcheck source=/dev/null
[[ -f /etc/default/goldbuslight-kmp ]] && . /etc/default/goldbuslight-kmp
set +a
XN="\${DISPLAY#*:}"
XN="\${XN%%.*}"
X_SOCK="/tmp/.X11-unix/X\${XN}"
for _ in \$(seq 1 120); do
  [[ -S "\$X_SOCK" ]] && break
  sleep 1
done
# Launch the generated start script from the Gradle distribution
exec "$INSTALL_DIR/bin/GoldbusLight"
EOF
chmod 0755 "$INSTALL_DIR/launch.sh"
chown "$RUN_USER:$RUN_USER" "$INSTALL_DIR/launch.sh"

cat >/etc/systemd/system/goldbuslight-kmp.service <<EOF
[Unit]
Description=GoldbusLight (Kotlin Multiplatform)
After=network-online.target display-manager.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
EnvironmentFile=-/etc/default/goldbuslight-kmp
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
systemctl enable goldbuslight-kmp.service

echo ""
echo "GoldbusLight KMP service setup complete!"
echo "Make sure to deploy your compiled binary to $INSTALL_DIR/bin/GoldbusLight before starting."
echo "Start with: systemctl start goldbuslight-kmp.service"

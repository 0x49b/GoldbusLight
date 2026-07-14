#!/usr/bin/env bash
# GoldbusLight Raspberry Pi manager — install, update, boot, and service control.
#
# One script for Pi deployments:
#   sudo ./scripts/goldbuslight-pi.sh install /path/to/GoldbusLight-linux-arm64 --boot
#   sudo ./scripts/goldbuslight-pi.sh install --release v0.0.19 --boot
#   sudo ./scripts/goldbuslight-pi.sh update v0.0.19
#   sudo ./scripts/goldbuslight-pi.sh boot enable
#   sudo ./scripts/goldbuslight-pi.sh status
#
# Environment overrides (all subcommands):
#   GOLDBUS_USER          default: pi
#   GOLDBUS_INSTALL_DIR   default: /opt/goldbuslight
#   GOLDBUS_SERVICE_MODE  default: user  (user | system)
#   GOLDBUS_REPO          default: 0x49b/GoldbusLight
#   GOLDBUS_ASSET         default: GoldbusLight-linux-arm64

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPICON_SRC="$SCRIPT_DIR/../build/appicon.png"

REPO="${GOLDBUS_REPO:-0x49b/GoldbusLight}"
ASSET="${GOLDBUS_ASSET:-GoldbusLight-linux-arm64}"
INSTALL_DIR="${GOLDBUS_INSTALL_DIR:-/opt/goldbuslight}"
RUN_USER="${GOLDBUS_USER:-pi}"
SERVICE_MODE="${GOLDBUS_SERVICE_MODE:-user}"

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"
}

validate_service_mode() {
  [[ "$SERVICE_MODE" == user || "$SERVICE_MODE" == system ]] || die "service mode must be user or system"
}

validate_run_user() {
  id -u "$RUN_USER" >/dev/null 2>&1 || die "unix user does not exist: $RUN_USER"
}

run_home() {
  eval echo "~$RUN_USER"
}

user_runtime_dir() {
  echo "/run/user/$(id -u "$RUN_USER")"
}

user_systemctl() {
  sudo -u "$RUN_USER" XDG_RUNTIME_DIR="$(user_runtime_dir)" systemctl --user "$@"
}

system_systemctl() {
  systemctl "$@"
}

service_ctl() {
  if [[ "$SERVICE_MODE" == user ]]; then
    user_systemctl "$@"
  else
    system_systemctl "$@"
  fi
}

app_paths() {
  APP_BIN="$INSTALL_DIR/GoldbusLight"
  APP_BAK="$APP_BIN.bak"
  APP_PREVIOUS="$APP_BIN.previous"
  LAUNCH_SH="$INSTALL_DIR/launch.sh"
  ICON_FILE="$INSTALL_DIR/goldbuslight.png"
  DESKTOP_FILE="/usr/share/applications/goldbuslight.desktop"
}

stop_app() {
  log "Stopping GoldbusLight"
  service_ctl stop goldbuslight.service 2>/dev/null || true
  pkill -u "$RUN_USER" -f "$INSTALL_DIR/GoldbusLight" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! pgrep -u "$RUN_USER" -f "$INSTALL_DIR/GoldbusLight" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
}

start_app() {
  log "Starting GoldbusLight"
  service_ctl start goldbuslight.service
}

install_runtime_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    libgtk-3-0 \
    libwebkit2gtk-4.1-0 \
    libayatana-appindicator3-1 \
    xdg-utils \
    curl
}

write_env_file() {
  if [[ ! -f /etc/default/goldbuslight ]]; then
    cat >/etc/default/goldbuslight <<'EOF'
# GoldbusLight runtime (exported by systemd units below)
GOLDBUS_FULLSCREEN=1
EOF
    chmod 0644 /etc/default/goldbuslight
  fi
}

write_launcher() {
  install -d -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$INSTALL_DIR"
  cat >"$LAUNCH_SH" <<EOF
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
  chmod 0755 "$LAUNCH_SH"
  chown "$RUN_USER:$RUN_USER" "$LAUNCH_SH"
}

write_desktop_entry() {
  if [[ -f "$APPICON_SRC" ]]; then
    install -m 0644 -o "$RUN_USER" -g "$RUN_USER" "$APPICON_SRC" "$ICON_FILE"
  fi
  cat >"$DESKTOP_FILE" <<EOF
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
  chmod 0644 "$DESKTOP_FILE"
}

write_service_unit() {
  local run_home
  run_home="$(run_home)"
  if [[ "$SERVICE_MODE" == user ]]; then
    install -d -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$run_home/.config/systemd/user"
    cat >"$run_home/.config/systemd/user/goldbuslight.service" <<EOF
[Unit]
Description=Goldbus Light Controller
After=graphical-session.target network-online.target
Wants=graphical-session.target network-online.target

[Service]
Type=simple
EnvironmentFile=-/etc/default/goldbuslight
Environment=DISPLAY=:0
WorkingDirectory=$INSTALL_DIR
ExecStart=$LAUNCH_SH
Restart=on-failure
RestartSec=4

[Install]
WantedBy=graphical-session.target
EOF
    chown "$RUN_USER:$RUN_USER" "$run_home/.config/systemd/user/goldbuslight.service"
    chmod 0644 "$run_home/.config/systemd/user/goldbuslight.service"
    rm -f /etc/systemd/system/goldbuslight.service
    systemctl daemon-reload
  else
    cat >/etc/systemd/system/goldbuslight.service <<EOF
[Unit]
Description=Goldbus Light Controller
After=graphical.target network-online.target display-manager.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
EnvironmentFile=-/etc/default/goldbuslight
Environment=DISPLAY=:0
Environment=XAUTHORITY=$run_home/.Xauthority
WorkingDirectory=$INSTALL_DIR
ExecStart=$LAUNCH_SH
Restart=on-failure
RestartSec=4

[Install]
WantedBy=graphical.target
EOF
    systemctl daemon-reload
    rm -f "$run_home/.config/systemd/user/goldbuslight.service"
  fi
}

enable_boot() {
  log "Enabling GoldbusLight to start when the desktop is running"
  if [[ "$SERVICE_MODE" == user ]]; then
    loginctl enable-linger "$RUN_USER" || true
    user_systemctl daemon-reload
    user_systemctl enable --now goldbuslight.service
    echo "Boot autostart: enabled (user service, starts with graphical-session.target)"
    echo "Linger for $RUN_USER: $(loginctl show-user "$RUN_USER" -p Linger --value 2>/dev/null || echo unknown)"
  else
    system_systemctl enable --now goldbuslight.service
    echo "Boot autostart: enabled (system service, starts with graphical.target)"
  fi
}

disable_boot() {
  log "Disabling GoldbusLight boot autostart"
  service_ctl disable goldbuslight.service 2>/dev/null || true
  service_ctl stop goldbuslight.service 2>/dev/null || true
  echo "Boot autostart: disabled (service unit remains installed)"
}

install_binary_file() {
  local src="$1"
  [[ -f "$src" ]] || die "binary not found: $src"
  install -d -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$INSTALL_DIR"
  install -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$src" "$APP_BIN"
}

replace_binary_file() {
  local src="$1"
  [[ -f "$src" ]] || die "binary not found: $src"
  [[ -f "$APP_BIN" ]] && cp -f "$APP_BIN" "$APP_PREVIOUS"
  install -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$src" "$APP_BIN.new"
  mv -f "$APP_BIN.new" "$APP_BIN"
}

normalize_tag() {
  local tag="$1"
  case "$tag" in
    v*|V*) echo "$tag" ;;
    *) echo "v$tag" ;;
  esac
}

download_release_to() {
  local tag="$1"
  local dest="$2"
  local url
  tag="$(normalize_tag "$tag")"
  url="https://github.com/${REPO}/releases/download/${tag}/${ASSET}"
  command -v curl >/dev/null 2>&1 || die "curl is required"
  log "Downloading $tag ($ASSET) from $REPO"
  local http_status
  http_status="$(curl -fL --retry 3 --connect-timeout 15 -w '%{http_code}' -o "$dest" "$url" 2>/dev/null || true)"
  if [[ ! -s "$dest" ]]; then
    die "download failed (HTTP $http_status) — check tag exists and asset name: $url"
  fi
  file "$dest" 2>/dev/null | grep -qE 'ELF.*aarch64|ELF.*ARM aarch64' || \
    log "warning: downloaded asset is not aarch64 ELF (continuing anyway)"
}

cmd_install() {
  local binary_src=""
  local release_tag=""
  local enable_boot=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      --asset) ASSET="${2:?}"; shift 2 ;;
      --repo) REPO="${2:?}"; shift 2 ;;
      --release) release_tag="${2:?}"; shift 2 ;;
      --boot) enable_boot=true; shift ;;
      -h|--help) usage_install; exit 0 ;;
      -*) die "unknown flag: $1" ;;
      *)
        [[ -z "$binary_src" ]] || die "unexpected extra argument: $1"
        binary_src="$1"
        shift
        ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  app_paths

  if [[ -n "$release_tag" && -n "$binary_src" ]]; then
    die "use either a local binary path or --release <tag>, not both"
  fi
  if [[ -z "$release_tag" && -z "$binary_src" ]]; then
    usage_install
    exit 1
  fi

  install_runtime_packages

  local tmp_dir=""
  if [[ -n "$release_tag" ]]; then
    tmp_dir="$(mktemp -d -t goldbuslight-install.XXXXXX)"
    trap 'rm -rf "$tmp_dir"' EXIT
    download_release_to "$release_tag" "$tmp_dir/$ASSET"
    binary_src="$tmp_dir/$ASSET"
  fi

  install_binary_file "$binary_src"
  write_env_file
  write_launcher
  write_desktop_entry
  write_service_unit

  if [[ "$enable_boot" == true ]]; then
    enable_boot
  else
    echo "Boot autostart: not enabled (pass --boot or run: sudo $0 boot enable)"
  fi

  echo ""
  echo "GoldbusLight installed to $INSTALL_DIR"
  echo "Menu entry: $DESKTOP_FILE"
  echo "Fullscreen: GOLDBUS_FULLSCREEN in /etc/default/goldbuslight"
  echo "Update later with: sudo $0 update <tag>"
  echo "Reboot recommended after first install."
}

cmd_update() {
  local tag=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      --asset) ASSET="${2:?}"; shift 2 ;;
      --repo) REPO="${2:?}"; shift 2 ;;
      -h|--help) usage_update; exit 0 ;;
      -*) die "unknown flag: $1" ;;
      *)
        [[ -z "$tag" ]] || die "unexpected extra argument: $1"
        tag="$1"
        shift
        ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  [[ -n "$tag" ]] || { usage_update; exit 1; }
  [[ -d "$INSTALL_DIR" ]] || die "install dir not found: $INSTALL_DIR (run: sudo $0 install ...)"

  app_paths
  local tmp_dir
  tmp_dir="$(mktemp -d -t goldbuslight-update.XXXXXX)"
  trap 'rm -rf "$tmp_dir"' EXIT

  download_release_to "$tag" "$tmp_dir/$ASSET"
  stop_app
  replace_binary_file "$tmp_dir/$ASSET"
  start_app

  log "Done. Installed $(normalize_tag "$tag") to $INSTALL_DIR"
  echo "Rollback copy: $APP_PREVIOUS"
}

cmd_fix() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      -h|--help) usage_fix; exit 0 ;;
      -*) die "unknown flag: $1" ;;
      *) die "unexpected argument: $1" ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  [[ -d "$INSTALL_DIR" ]] || die "install dir not found: $INSTALL_DIR"

  app_paths
  stop_app

  log "Fixing ownership and permissions"
  chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"
  chmod 0755 "$INSTALL_DIR"
  [[ -f "$APP_BIN" ]] && chmod 0755 "$APP_BIN"
  [[ -f "$LAUNCH_SH" ]] && chmod 0755 "$LAUNCH_SH"

  if [[ ! -f "$APP_BIN" && -f "$APP_BAK" ]]; then
    log "Restoring missing binary from failed in-app update backup"
    mv -f "$APP_BAK" "$APP_BIN"
    chmod 0755 "$APP_BIN"
    chown "$RUN_USER:$RUN_USER" "$APP_BIN"
  fi

  log "Cleaning stale updater temp files"
  rm -f "$INSTALL_DIR/.GoldbusLight.new" "$INSTALL_DIR/.GoldbusLight.old"
  [[ -f "$APP_BIN" ]] && rm -f "$APP_BAK"

  write_env_file
  write_launcher
  write_desktop_entry
  write_service_unit
  enable_boot

  echo ""
  echo "Done. Install dir repaired and service restarted."
}

cmd_boot() {
  local action="${1:-}"
  shift || true

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      -h|--help) usage_boot; exit 0 ;;
      *) die "unexpected argument: $1" ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  app_paths
  [[ -f "$LAUNCH_SH" ]] || die "install not found (run: sudo $0 install ...)"

  case "$action" in
    enable) enable_boot ;;
    disable) disable_boot ;;
    status)
      if service_ctl is-enabled goldbuslight.service >/dev/null 2>&1; then
        echo "Boot autostart: enabled"
      else
        echo "Boot autostart: disabled"
      fi
      service_ctl status goldbuslight.service --no-pager || true
      ;;
    *)
      usage_boot
      exit 1
      ;;
  esac
}

cmd_service() {
  local action="$1"
  shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      *) die "unexpected argument: $1" ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  app_paths

  case "$action" in
    start) start_app ;;
    stop) stop_app ;;
    restart) stop_app; start_app ;;
    status) service_ctl status goldbuslight.service --no-pager ;;
    *) die "unknown service action: $action" ;;
  esac
}

cmd_rollback() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) RUN_USER="${2:?}"; shift 2 ;;
      --install-dir) INSTALL_DIR="${2:?}"; shift 2 ;;
      --service-mode) SERVICE_MODE="${2:?}"; shift 2 ;;
      -h|--help) usage_rollback; exit 0 ;;
      *) die "unexpected argument: $1" ;;
    esac
  done

  require_root
  validate_service_mode
  validate_run_user
  app_paths
  [[ -f "$APP_PREVIOUS" ]] || die "rollback copy not found: $APP_PREVIOUS"

  stop_app
  cp -f "$APP_PREVIOUS" "$APP_BIN"
  chmod 0755 "$APP_BIN"
  chown "$RUN_USER:$RUN_USER" "$APP_BIN"
  start_app
  log "Rolled back to $APP_PREVIOUS"
}

usage_header() {
  cat <<EOF
GoldbusLight Raspberry Pi manager

Usage:
  sudo $0 install <binary> [--boot] [options]
  sudo $0 install --release <tag> [--boot] [options]
  sudo $0 update <tag> [options]
  sudo $0 fix [options]
  sudo $0 boot enable|disable|status [options]
  sudo $0 start|stop|restart|status [options]
  sudo $0 rollback [options]

Common options:
  --user <name>           Run user (default: pi)
  --install-dir <path>    Install directory (default: /opt/goldbuslight)
  --service-mode <mode>   user or system (default: user)
  --repo <owner/repo>     GitHub repo for release downloads
  --asset <name>          Release asset name (default: GoldbusLight-linux-arm64)

Boot autostart:
  Pass --boot on install, or run: sudo $0 boot enable
  User mode starts with graphical-session.target (desktop session).
  System mode starts with graphical.target.

Do not use the in-app updater on Pi — use: sudo $0 update <tag>
EOF
}

usage_install() {
  usage_header
  cat <<EOF

Install examples:
  sudo $0 install /home/pi/Downloads/GoldbusLight-linux-arm64 --boot
  sudo $0 install --release v0.0.19 --boot
EOF
}

usage_update() {
  usage_header
  cat <<EOF

Update example:
  sudo $0 update v0.0.19
EOF
}

usage_fix() {
  usage_header
  cat <<EOF

Fix example (restore .bak, repair permissions, restart):
  sudo $0 fix
EOF
}

usage_boot() {
  usage_header
  cat <<EOF

Boot examples:
  sudo $0 boot enable
  sudo $0 boot disable
  sudo $0 boot status
EOF
}

usage_rollback() {
  usage_header
  cat <<EOF

Rollback example:
  sudo $0 rollback
EOF
}

main() {
  local cmd="${1:-}"
  if [[ -z "$cmd" || "$cmd" == -h || "$cmd" == --help ]]; then
    usage_header
    exit 0
  fi
  shift || true

  case "$cmd" in
    install) cmd_install "$@" ;;
    update) cmd_update "$@" ;;
    fix) cmd_fix "$@" ;;
    boot) cmd_boot "$@" ;;
    start|stop|restart|status)
      if [[ "$cmd" == status && "${1:-}" == "goldbuslight.service" ]]; then
        shift
      fi
      cmd_service "$cmd" "$@"
      ;;
    rollback) cmd_rollback "$@" ;;
    *)
      die "unknown command: $cmd (run: sudo $0 --help)"
      ;;
  esac
}

main "$@"

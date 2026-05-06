# Goldbus Light Controller

Wails v3 desktop app for controlling WLED lights in the Goldbus environment.

## Development

- Run in dev mode:
  - `wails3 dev`
- Build native binary:
  - `task linux:build DEV=false` (Linux)
  - `task darwin:build DEV=false` (macOS)
  - `task windows:build DEV=false` (Windows)

## Raspberry Pi setup

### Supported platform

- Raspberry Pi OS **64-bit** (`linux-arm64`)
- Use release asset: `GoldbusLight-linux-arm64`

### Install on Pi

From repo checkout:

```bash
sudo ./scripts/install-raspberry-pi.sh /path/to/GoldbusLight-linux-arm64
```

Optional env overrides:

- `GOLDBUS_USER` (default: `pi`)
- `GOLDBUS_INSTALL_DIR` (default: `/opt/goldbuslight`)
- `GOLDBUS_SERVICE_MODE` (`user` or `system`, default: `user`)

Example:

```bash
sudo GOLDBUS_USER=pi GOLDBUS_SERVICE_MODE=user ./scripts/install-raspberry-pi.sh /home/pi/Downloads/GoldbusLight-linux-arm64
```

### Launch behavior

- Menu entry is installed at `/usr/share/applications/goldbuslight.desktop`
- Desktop icon is intentionally **not** created (menu-only policy) to avoid per-desktop trust prompt behavior.

### Updates and permissions

Self-update writes replacement binaries in the install directory. The runtime user must be able to write to:

- `/opt/goldbuslight`
- `/opt/goldbuslight/GoldbusLight`

Installer and recovery scripts enforce this for `GOLDBUS_USER`.

### Recovery / troubleshooting

If updates fail with `.old/.new` or permission errors:

```bash
sudo GOLDBUS_USER=pi GOLDBUS_SERVICE_MODE=user ./scripts/fix-raspi-update-state.sh
```

This script:

- stops the service,
- repairs ownership/permissions in install dir,
- removes stale `.GoldbusLight.old` and `.GoldbusLight.new`,
- reinstalls the menu entry,
- restarts the service.

### Fullscreen startup

Fullscreen is controlled by `/etc/default/goldbuslight`:

```bash
GOLDBUS_FULLSCREEN=1
```

If display artifacts appear until manual resize, this is often a Raspberry Pi WebKit/GTK compositor startup quirk. Restarting the app/session typically helps.

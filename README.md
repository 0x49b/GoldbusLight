# Goldbus Light Controller

Wails v3 desktop app for controlling WLED lights in the Goldbus environment.

## User manual

End-user documentation is published on **GitHub Pages**: [Goldbus Light Controller manual](https://0x49b.github.io/GoldbusLight/).

Source lives in [`docs/`](docs/) and is built with [MkDocs](https://www.mkdocs.org/). Pushes to `master` that touch `docs/` deploy automatically via [`.github/workflows/docs.yml`](.github/workflows/docs.yml). Release tags also bundle the manual into the Pages artifact alongside `stable/update.json`.

To generate similar documentation for other projects, use the reusable agent skill at [`.cursor/skills/comprehensive-user-docs/`](.cursor/skills/comprehensive-user-docs/SKILL.md).

## Development

See **[setup.md](setup.md)** for OS packages (GTK/WebKit, PipeWire audio tools, NetworkManager, toolchain versions).


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

### One script for install, update, and boot

Use [`scripts/goldbuslight-pi.sh`](scripts/goldbuslight-pi.sh) for all Pi deployment tasks. **Do not** use the in-app updater on the default Pi install (`/opt/goldbuslight`) — it can delete the binary and leave only `GoldbusLight.bak` behind.

**Quick start** — download the script, fetch the latest release from GitHub, install with boot autostart:

```bash
curl -fsSL https://raw.githubusercontent.com/0x49b/GoldbusLight/master/scripts/goldbuslight-pi.sh -o goldbuslight-pi.sh
chmod +x goldbuslight-pi.sh
sudo ./goldbuslight-pi.sh install --latest --boot
```

**User-local install** (no sudo — app in `~/.local/share/goldbuslight`, command in `~/.local/bin`):

```bash
./goldbuslight-pi.sh install --latest --local
```

**First install** (from a local release binary):

```bash
sudo ./scripts/goldbuslight-pi.sh install /path/to/GoldbusLight-linux-arm64 --boot
```

**First install** (specific GitHub release tag):

```bash
sudo ./scripts/goldbuslight-pi.sh install --release v0.0.19 --boot
```

**Update** to the latest release:

```bash
sudo ./scripts/goldbuslight-pi.sh update --latest
```

**Update** to a specific tag:

```bash
sudo ./scripts/goldbuslight-pi.sh update v0.0.19
```

**Recover** after a failed in-app update (restores `GoldbusLight.bak` if needed):

```bash
sudo ./scripts/goldbuslight-pi.sh fix
```

**Boot autostart** (start when the desktop session is running):

```bash
sudo ./scripts/goldbuslight-pi.sh boot enable    # enable
sudo ./scripts/goldbuslight-pi.sh boot disable   # disable
sudo ./scripts/goldbuslight-pi.sh boot status     # check
```

**Service control**:

```bash
sudo ./scripts/goldbuslight-pi.sh status
sudo ./scripts/goldbuslight-pi.sh restart
```

**Rollback** after a bad update:

```bash
sudo ./scripts/goldbuslight-pi.sh rollback
```

The older `install-raspberry-pi.sh`, `install-release.sh`, and `fix-raspi-update-state.sh` scripts are thin wrappers around this command.

### Environment overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `GOLDBUS_USER` | `pi` | Unix user that runs the app |
| `GOLDBUS_INSTALL_DIR` | `/opt/goldbuslight` | Install directory |
| `GOLDBUS_SERVICE_MODE` | `user` | `user` or `system` systemd unit |
| `GOLDBUS_USER_BIN` | `~/.local/bin` | Symlink dir for `--local` installs |

Example:

```bash
sudo GOLDBUS_USER=pi GOLDBUS_SERVICE_MODE=user \
  ./scripts/goldbuslight-pi.sh install /home/pi/Downloads/GoldbusLight-linux-arm64 --boot
```

### Launch behavior

- Menu entry: `/usr/share/applications/goldbuslight.desktop`
- Desktop icon is intentionally **not** created (menu-only policy)
- With `--boot` or `boot enable`, the app starts when the **graphical desktop** is running (`graphical-session.target` for user services)
- Enable **desktop auto-login** in `raspi-config` if the Pi must boot straight into the app without a password

### Fullscreen startup

Fullscreen is controlled by `/etc/default/goldbuslight`:

```bash
GOLDBUS_FULLSCREEN=1
```

If display artifacts appear until manual resize, this is often a Raspberry Pi WebKit/GTK compositor startup quirk. Restarting the app/session typically helps.

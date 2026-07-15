# Raspberry Pi installation

Goldbus Light Controller is commonly deployed on a **Raspberry Pi** running **64-bit Raspberry Pi OS**, often as a fullscreen kiosk that controls WLED strips and DMX fixtures on a local network.

## Before you begin

1. Flash **Raspberry Pi OS (64-bit)** to your SD card.
2. Complete initial setup (user `pi` or your chosen account, network, desktop enabled).
3. Download `GoldbusLight-linux-arm64` from [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases), or copy it from another machine.

## One script: install, update, boot, and recovery

All Pi tasks use [`scripts/goldbuslight-pi.sh`](https://github.com/0x49b/GoldbusLight/blob/master/scripts/goldbuslight-pi.sh).

### Quick start (download script + latest release)

```bash
curl -fsSL https://raw.githubusercontent.com/0x49b/GoldbusLight/master/scripts/goldbuslight-pi.sh -o goldbuslight-pi.sh
chmod +x goldbuslight-pi.sh
sudo ./goldbuslight-pi.sh install --latest --boot
```

This downloads the newest `GoldbusLight-linux-arm64` from GitHub Releases and installs it to `/opt/goldbuslight`.

### User-local install (no sudo)

Installs the app under your home directory with a command in `~/.local/bin`:

```bash
./goldbuslight-pi.sh install --latest --local
```

| Path | Purpose |
|------|---------|
| `~/.local/share/goldbuslight/GoldbusLight` | Application binary |
| `~/.local/bin/GoldbusLight` | Command symlink (add `~/.local/bin` to PATH if needed) |
| `~/.local/share/applications/goldbuslight.desktop` | Application menu entry |

### Command reference

| Task | Command |
|------|---------|
| First install (local binary) | `sudo ./scripts/goldbuslight-pi.sh install /path/to/GoldbusLight-linux-arm64 --boot` |
| First install (latest GitHub release) | `sudo ./scripts/goldbuslight-pi.sh install --latest --boot` |
| First install (specific tag) | `sudo ./scripts/goldbuslight-pi.sh install --release v0.0.19 --boot` |
| First install (user-local) | `./scripts/goldbuslight-pi.sh install --latest --local` |
| **Update** to latest release | `sudo ./scripts/goldbuslight-pi.sh update --latest` |
| **Update** to specific tag | `sudo ./scripts/goldbuslight-pi.sh update v0.0.19` |
| Recover failed in-app update | `sudo ./scripts/goldbuslight-pi.sh fix` |
| Enable boot autostart | `sudo ./scripts/goldbuslight-pi.sh boot enable` |
| Disable boot autostart | `sudo ./scripts/goldbuslight-pi.sh boot disable` |
| Service status / restart | `sudo ./scripts/goldbuslight-pi.sh status` / `restart` |
| Roll back last update | `sudo ./scripts/goldbuslight-pi.sh rollback` |

!!! warning "Do not use the in-app updater on Pi"
    On the default install (`/opt/goldbuslight`), **Settings → Check for updates** is disabled because the Wails updater can delete `GoldbusLight` and leave only `GoldbusLight.bak`. Always update with `goldbuslight-pi.sh update <tag>`.

### First-time install example

```bash
sudo ./scripts/goldbuslight-pi.sh install /home/pi/Downloads/GoldbusLight-linux-arm64 --boot
```

`--boot` registers a systemd service that starts when the **graphical desktop session** is running. Without it, install the app and enable boot later:

```bash
sudo ./scripts/goldbuslight-pi.sh boot enable
```

### What install does

| Step | Result |
|------|--------|
| Installs packages | `libgtk-3-0`, `libwebkit2gtk-4.1-0`, app indicator, `xdg-utils`, `curl` |
| Installs binary | `/opt/goldbuslight/GoldbusLight` (default) |
| Writes config | `/etc/default/goldbuslight` with `GOLDBUS_FULLSCREEN=1` |
| Creates launcher | `launch.sh` waits for the X display socket |
| Desktop entry | `/usr/share/applications/goldbuslight.desktop` (application menu only) |
| systemd service | `goldbuslight.service` bound to `graphical-session.target` (user mode) |

A **desktop icon is not created** on purpose — only the application menu entry — to avoid per-desktop trust prompts on some Pi desktop environments.

### Environment overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `GOLDBUS_USER` | `pi` | Unix user that runs the service |
| `GOLDBUS_INSTALL_DIR` | `/opt/goldbuslight` | Install directory |
| `GOLDBUS_SERVICE_MODE` | `user` | `user` or `system` systemd unit |

Example:

```bash
sudo GOLDBUS_USER=pi GOLDBUS_SERVICE_MODE=user \
  ./scripts/goldbuslight-pi.sh install /home/pi/Downloads/GoldbusLight-linux-arm64 --boot
```

### After install

1. **Reboot** the Pi (recommended).
2. Enable **desktop auto-login** if the app must start without a password (`raspi-config` → System Options → Boot / Auto Login).
3. Confirm boot autostart: `sudo ./scripts/goldbuslight-pi.sh boot status`
4. Launch from the application menu: **Goldbus Light Controller**.

## Fullscreen startup

Fullscreen is controlled by `/etc/default/goldbuslight`:

```bash
GOLDBUS_FULLSCREEN=1
```

Set to `0` to start in windowed mode. The application reads this variable at launch.

!!! tip "Display glitches on startup"
    On some Pi setups, WebKit/GTK may show artifacts until the window is resized. Restarting the app or session usually clears this.

## Updating to a new release

**Always** update from the shell — not from inside the app:

```bash
sudo ./scripts/goldbuslight-pi.sh update --latest
```

Or pin a specific release:

```bash
sudo ./scripts/goldbuslight-pi.sh update v0.0.19
```

For a user-local install:

```bash
./scripts/goldbuslight-pi.sh update --latest --local
```

### What update does

1. Downloads `GoldbusLight-linux-arm64` from GitHub
2. Stops `goldbuslight.service`
3. Replaces `/opt/goldbuslight/GoldbusLight` atomically (keeps `GoldbusLight.previous` for rollback)
4. Restarts the service

Same environment overrides apply (`GOLDBUS_USER`, `GOLDBUS_INSTALL_DIR`, `GOLDBUS_SERVICE_MODE`). Override asset or repo with `--asset` / `--repo` if needed.

### Rolling back

```bash
sudo ./scripts/goldbuslight-pi.sh rollback
```

Or manually:

```bash
sudo ./scripts/goldbuslight-pi.sh stop
sudo mv /opt/goldbuslight/GoldbusLight.previous /opt/goldbuslight/GoldbusLight
sudo ./scripts/goldbuslight-pi.sh start
```

### Recovering from a failed in-app update

If the app disappeared and only `GoldbusLight.bak` remains:

```bash
sudo ./scripts/goldbuslight-pi.sh fix
```

## Boot autostart

The Pi installer can start Goldbus Light when the desktop is ready:

| Mode | systemd target | When it starts |
|------|----------------|----------------|
| **user** (default) | `graphical-session.target` | After the run user logs into the desktop |
| **system** | `graphical.target` | After the display manager brings up the desktop |

```bash
# Enable (also done by install --boot)
sudo ./scripts/goldbuslight-pi.sh boot enable

# Check whether it is enabled and running
sudo ./scripts/goldbuslight-pi.sh boot status
```

For kiosk use, also enable **desktop auto-login** so the graphical session starts without a password prompt.

## Optional: Party audio packages

If you use **Audio reactive** party mode, install PipeWire capture tools if they are not already present:

```bash
sudo apt-get install -y pipewire pipewire-pulseaudio pipewire-utils pulseaudio-utils
```

Verify:

```bash
pactl get-default-source
pw-record --version
```

## Optional: NetworkManager

To use **Settings → Access point**, ensure NetworkManager is installed:

```bash
sudo apt-get install -y network-manager
```

## Service management

| Task | Command |
|------|---------|
| Status | `sudo ./scripts/goldbuslight-pi.sh status` |
| Stop | `sudo ./scripts/goldbuslight-pi.sh stop` |
| Start | `sudo ./scripts/goldbuslight-pi.sh start` |
| Restart | `sudo ./scripts/goldbuslight-pi.sh restart` |
| Logs (user service) | `journalctl --user -u goldbuslight.service -f` |

For `GOLDBUS_SERVICE_MODE=system`, use `journalctl -u goldbuslight.service -f`.

## USB DMX on the Pi

Plug in your USB-DMX adapter before starting the app. Ensure the run user can access serial devices (often membership in the `dialout` group). Enable **Enable USB transport** and select the device under **Settings → DMX**.

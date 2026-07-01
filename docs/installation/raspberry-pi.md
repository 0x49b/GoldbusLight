# Raspberry Pi installation

Goldbus Light Controller is commonly deployed on a **Raspberry Pi** running **64-bit Raspberry Pi OS**, often as a fullscreen kiosk that controls WLED strips and DMX fixtures on a local network.

## Before you begin

1. Flash **Raspberry Pi OS (64-bit)** to your SD card.
2. Complete initial setup (user `pi` or your chosen account, network, desktop enabled).
3. Download `GoldbusLight-linux-arm64` from [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases), or copy it from another machine.

## First-time install

From a checkout of this repository (or after copying `scripts/install-raspberry-pi.sh`):

```bash
sudo ./scripts/install-raspberry-pi.sh /path/to/GoldbusLight-linux-arm64
```

Example with the release binary in your home directory:

```bash
sudo ./scripts/install-raspberry-pi.sh /home/pi/Downloads/GoldbusLight-linux-arm64
```

### What the installer does

| Step | Result |
|------|--------|
| Installs packages | `libgtk-3-0`, `libwebkit2gtk-4.1-0`, app indicator, `xdg-utils` |
| Installs binary | `/opt/goldbuslight/GoldbusLight` (default) |
| Writes config | `/etc/default/goldbuslight` with `GOLDBUS_FULLSCREEN=1` |
| Creates launcher | `launch.sh` waits for the X display socket |
| Desktop entry | `/usr/share/applications/goldbuslight.desktop` (application menu only) |
| systemd service | `goldbuslight.service` (user mode by default) |

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
  ./scripts/install-raspberry-pi.sh /home/pi/Downloads/GoldbusLight-linux-arm64
```

### After install

1. **Reboot** the Pi (recommended).
2. Enable **desktop auto-login** if the app must start without a password (`raspi-config` → System Options → Boot / Auto Login).
3. Enable the user service after first graphical login:

   ```bash
   systemctl --user enable goldbuslight.service
   systemctl --user start goldbuslight.service
   ```

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

Updates are **not** applied from inside the app. Use the release install script:

```bash
sudo ./scripts/install-release.sh v0.0.19
```

Replace `v0.0.19` with the tag from [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases).

### What the update script does

1. Downloads `GoldbusLight-linux-arm64` from GitHub
2. Stops `goldbuslight.service`
3. Replaces `/opt/goldbuslight/GoldbusLight` atomically (keeps `GoldbusLight.previous` for rollback)
4. Restarts the service

Same environment overrides apply (`GOLDBUS_USER`, `GOLDBUS_INSTALL_DIR`, `GOLDBUS_SERVICE_MODE`). Override asset or repo with `--asset` / `--repo` if needed.

### Rolling back

```bash
sudo systemctl --user --machine=pi@ stop goldbuslight.service
sudo mv /opt/goldbuslight/GoldbusLight.previous /opt/goldbuslight/GoldbusLight
sudo systemctl --user --machine=pi@ start goldbuslight.service
```

Adjust the `systemctl --machine=` target if your run user is not `pi`.

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

| Task | Command (user service) |
|------|--------------------------|
| Status | `systemctl --user status goldbuslight.service` |
| Stop | `systemctl --user stop goldbuslight.service` |
| Start | `systemctl --user start goldbuslight.service` |
| Logs | `journalctl --user -u goldbuslight.service -f` |

For `GOLDBUS_SERVICE_MODE=system`, omit `--user` and use `sudo systemctl`.

## USB DMX on the Pi

Plug in your USB-DMX adapter before starting the app. Ensure the run user can access serial devices (often membership in the `dialout` group). Enable **Enable USB transport (all universes)** and select the device on each **{Universe name} interface** card under **Settings → DMX**.

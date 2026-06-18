# Desktop installation (Linux, macOS, Windows)

For development machines or non-Pi Linux desktops, install the appropriate release binary from [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases).

## Linux (x64 or arm64)

1. Download `GoldbusLight-linux-amd64` or `GoldbusLight-linux-arm64`.
2. Make it executable:

   ```bash
   chmod +x GoldbusLight-linux-amd64
   mv GoldbusLight-linux-amd64 ~/bin/GoldbusLight   # optional location
   ```

3. Install runtime libraries if missing (Debian/Ubuntu example):

   ```bash
   sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 xdg-utils
   ```

4. Run:

   ```bash
   ./GoldbusLight
   ```

### Optional environment variables

| Variable | Effect |
|----------|--------|
| `GOLDBUS_FULLSCREEN=1` | Start fullscreen |
| `GOLDBUS_LOG_FILE` | Override log file path |

### Party audio (Linux)

Install PipeWire/PulseAudio tools for audio-reactive party mode:

```bash
sudo apt-get install -y pipewire pipewire-pulseaudio pipewire-utils pulseaudio-utils
```

## macOS

1. Download `GoldbusLight-darwin-arm64` (Apple silicon) or `GoldbusLight-darwin-amd64` (Intel).
2. Remove quarantine if macOS blocks the unsigned binary:

   ```bash
   xattr -dr com.apple.quarantine GoldbusLight-darwin-arm64
   chmod +x GoldbusLight-darwin-arm64
   ```

3. Run from Terminal or move to `/Applications` and open from Finder.

!!! note "Unsigned binaries"
    CI builds are **not** notarized. You may need to allow the app in **System Settings → Privacy & Security** on first launch.

Party audio uses the built-in capture backend; no extra OS packages are required.

## Windows

1. Download `GoldbusLight-windows-amd64.exe`.
2. Run the executable. **WebView2** is required (usually preinstalled on Windows 11).

Party audio works without additional drivers in most cases.

## Linux desktop integration

A `.desktop` file is included in the repository at `build/linux/GoldbusLight.desktop` for manual installation into `~/.local/share/applications/` if you want a menu entry.

## Updates

Unlike the Raspberry Pi scripted updater, desktop installs are updated manually:

1. Download the new release asset.
2. Replace the old binary.
3. Restart the application.

The Pi `install-release.sh` script is specific to the `/opt/goldbuslight` layout and systemd service.

## Building locally

See [setup.md](https://github.com/0x49b/GoldbusLight/blob/master/setup.md) for development dependencies and:

```bash
task linux:build DEV=false    # Linux
task darwin:build DEV=false   # macOS
task windows:build DEV=false  # Windows
```

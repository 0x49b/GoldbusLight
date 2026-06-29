# Goldbus Light Controller — User Manual

**Goldbus Light Controller** (German UI title: *Goldbus Light Controller*) is a desktop application for controlling lighting in the Goldbus environment. It combines **WLED** network LED controllers and **DMX** stage lighting in one interface, with a unified **Party mode** for automated and audio-reactive shows.

This manual describes how to install, configure, and operate the application from an end-user perspective.

## What the application does

| Area | Capabilities |
|------|----------------|
| **WLED** | Discover WLED devices on the network, control individual segments, apply global color/effect presets, provision new devices |
| **DMX** | Configure fixtures, patch a 512-channel universe, drive lights over USB (Enttec Pro) or Art-Net, live manual control, preset sequences |
| **Party mode** | Automated or audio-reactive shows across selected WLED devices and DMX fixtures, including smoke/hazer bursts |
| **Settings** | Wi-Fi access point, backup/restore, transport console, channel sweep test tool |

## Supported platforms

| Platform | Notes |
|----------|-------|
| **Raspberry Pi OS 64-bit** | Primary deployment target; install via release scripts |
| **Linux (x64 / arm64)** | Native Wails desktop app |
| **macOS** | Intel and Apple silicon builds |
| **Windows** | x64 build |

Raspberry Pi releases are published as `GoldbusLight-linux-arm64` on [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases).

## Quick start

1. [Install the application](installation/index.md) on your host (Pi or desktop).
2. Launch **Goldbus Light Controller** from the application menu.
3. Open **Settings** and enable the components you need (**WLED**, **DMX**, or both).
4. For WLED: use **Discover** or wait for automatic discovery; devices appear in the sidebar.
5. For DMX: connect a USB-DMX interface or configure Art-Net in Settings, then create fixtures with the **+** button.
6. Open **Party** to run an automated or audio-reactive show.

## Documentation map

- **[Getting started](getting-started.md)** — First launch, enabling components, typical workflows
- **[Installation](installation/index.md)** — Raspberry Pi kiosk setup, desktop installs, updates
- **[Interface](interface/navigation.md)** — Sidebar, routes, status indicators
- **[WLED](wled/index.md)** — Discovery, device pages, general presets
- **[DMX](dmx/index.md)** — Universe grid, fixtures, live control, presets
- **[Party mode](party-mode/index.md)** — Auto and audio-reactive shows
- **[Settings](settings/index.md)** — Backup, network, console, test tools
- **[Troubleshooting](troubleshooting.md)** — Common problems and fixes

## Updates

On Raspberry Pi, application updates are installed from the shell (not from inside the app):

```bash
sudo ./scripts/install-release.sh v0.0.19
```

See [Raspberry Pi installation](installation/raspberry-pi.md#updating-to-a-new-release) for details.

The app also checks GitHub Pages for update metadata at `/stable/update.json` when auto-update features are enabled in a release.

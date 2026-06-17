# Installation overview

Goldbus Light Controller is distributed as native binaries built with [Wails v3](https://v3.wails.io/). Choose the install path that matches your hardware.

## Release downloads

Pre-built binaries are published on [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases):

| Asset | Platform |
|-------|----------|
| `GoldbusLight-linux-arm64` | Raspberry Pi OS 64-bit, Linux arm64 |
| `GoldbusLight-linux-amd64` | Linux x64 |
| `GoldbusLight-darwin-arm64` | macOS Apple silicon |
| `GoldbusLight-darwin-amd64` | macOS Intel |
| `GoldbusLight-windows-amd64.exe` | Windows x64 |

!!! warning "Raspberry Pi architecture"
    Use **64-bit** Raspberry Pi OS. 32-bit (`armv7`) builds are not published in CI.

## Installation guides

- **[Raspberry Pi](raspberry-pi.md)** — Recommended for kiosk / Goldbus deployments; includes systemd service and fullscreen startup
- **[Desktop](desktop.md)** — Linux, macOS, and Windows manual install

## System requirements

### All platforms

- Network access for WLED devices (LAN) and optional Art-Net
- USB port for Enttec Pro–style DMX adapters (optional)

### Raspberry Pi / Linux desktop runtime

- GTK 3 and WebKit2GTK 4.1 (installed automatically by the Pi installer)
- For **Party audio mode** on Linux: PipeWire/PulseAudio tools (`pactl`, `pw-record`)
- For **Wi-Fi access point** settings on Linux: NetworkManager (`nmcli`)

### Party audio by platform

| Platform | Audio capture backend |
|----------|----------------------|
| Linux | PipeWire/PulseAudio via `pw-record` |
| macOS / Windows | In-process capture (malgo) |

See [Troubleshooting — Party audio](../troubleshooting.md#party-audio-issues) if audio mode fails on Linux.

## Building from source

Developers can build locally; see [setup.md](https://github.com/0x49b/GoldbusLight/blob/master/setup.md) in the repository for toolchain and OS packages.

```bash
task dev          # development mode
task linux:build DEV=false   # release binary (Linux)
```

This manual focuses on end-user installation from releases.

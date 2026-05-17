# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoldbusLight is a desktop application for controlling WLED smart lights and DMX fixtures in the Goldbus environment. Built with Wails v3, it provides a React-based UI for managing lighting presets, device discovery, network provisioning, and real-time DMX control.

## Tech Stack

- **Backend**: Go 1.26.1 with Wails v3 (desktop framework)
- **Frontend**: React 18 + TypeScript with Vite, TailwindCSS, shadcn/ui
- **State**: Zustand for client state, snapshot-based sync from Go backend
- **Protocols**: WLED HTTP API, Art-Net (DMX over IP), USB serial DMX output

## Development Commands

### Running in development mode
```bash
wails3 dev
# or
task dev
```

### Building native binaries
```bash
# Linux
task linux:build DEV=false

# macOS
task darwin:build DEV=false

# Windows
task windows:build DEV=false
```

### Frontend-only development
```bash
cd frontend
npm install
npm run dev      # Development server
npm run build    # Production build
```

### Running tests
```bash
# Go tests
go test ./...

# Run specific test
go test ./internal/wledhttp -v -run TestHostName
```

## Architecture

### Backend Structure

The Go backend is organized into these key packages:

- **`cmd/goldbuslight/main.go`**: Entry point. Initializes WLEDController, binds to Wails runtime, starts snapshot event loop (1Hz).
- **`internal/controller/controller.go`**: Core `WLEDController` manages:
  - Device discovery (mDNS/zeroconf + subnet probing)
  - Persisted settings (JSON files in user data directory)
  - WLED HTTP API calls for state/config changes
  - Access point provisioning via NetworkManager (Linux) or platform-specific APIs
  - DMX live output coordination
- **`internal/service/goldbuslightservice.go`**: Wails-bound service exposing RPC methods to the frontend (e.g., `SaveControllerSettings`, `SetDeviceState`, `DiscoverDevicesNow`).
- **`internal/dmx/`**: Art-Net packet builder + USB serial DMX streaming. Live output runs in a worker goroutine with channel-based updates.
- **`internal/discovery/`**: mDNS discovery via `grandcat/zeroconf` and subnet HTTP probing for WLED devices.
- **`internal/serial/`**: Cross-platform USB serial enumeration (platform-specific `_darwin.go`, `_linux.go`, `_windows.go` files).
- **`internal/network/`**: NetworkManager D-Bus integration (Linux) for AP/station mode switching.
- **`internal/wledhttp/`**: HTTP client utilities for WLED JSON API.

### Frontend Structure

- **`frontend/src/App.tsx`**: Top-level router. Renders `GeneralPanel` (presets tab), device detail views, DMX views, or settings based on route state.
- **`frontend/src/hooks/useControllerApp.ts`**: Main state hook. Subscribes to `controller:snapshot` events from Go, manages UI state (route, busy flags, preset values), and calls Wails RPC methods.
- **`frontend/src/components/`**:
  - `device/`: Device list, detail modals, effect/palette pickers.
  - `dmx/`: DMX fixture editor, live controls (faders/XY pads), universe grid view.
  - `settings/`: Controller settings editor (AP config, WLED discovery, Art-Net, provisioning defaults).
  - `presets/`: General preset panel with quick color/brightness/effect controls.
  - `ui/`: shadcn/ui components (buttons, inputs, dialogs, etc.).
  - `audio/`: Custom audio-style UI controls (faders, knobs, XY pads) for DMX.

### Snapshot Event Pattern

The backend emits `controller:snapshot` events every second. The frontend hook subscribes to these and updates local state. This one-way flow avoids polling and keeps the UI reactive. Local edits (e.g., settings form) are staged in React state, then committed via RPC methods which return an updated snapshot.

### Platform-Specific Code

Many packages use build tags for OS-specific implementations:
- Network provisioning: `network_linux.go` (NetworkManager D-Bus), `network_darwin.go` (macOS stubs), `network_windows.go` (Windows stubs).
- Serial port enumeration: `usb_serial_darwin.go`, `usb_serial_linux.go`, `usb_serial_windows.go`.
- Serial write path resolution: `serial_write_path_darwin.go` (bridges `/dev/tty.*` to `/dev/cu.*`), `serial_write_path_default.go`.

When adding platform features, use build constraints: `//go:build linux` or `//go:build darwin`.

## Raspberry Pi Deployment

The app is designed to run as a systemd service on Raspberry Pi OS (64-bit). Installation and updates are scripted:

- **Install**: `sudo ./scripts/install-raspberry-pi.sh /path/to/GoldbusLight-linux-arm64`
  - Sets up `/opt/goldbuslight`, creates systemd user service, installs desktop menu entry.
- **Update**: `sudo ./scripts/install-release.sh <tag>` (e.g., `v0.0.19`)
  - Downloads release asset, stops service, replaces binary atomically, restarts service.
- **Fullscreen**: Controlled by `/etc/default/goldbuslight` (`GOLDBUS_FULLSCREEN=1`).

Default install uses user-mode systemd (`systemctl --user`). Override with `GOLDBUS_SERVICE_MODE=system` for system-level service.

## WLED Integration

WLED devices are discovered via mDNS (`_wled._tcp`) or subnet HTTP probing. The controller:
- Fetches `/json/info` and `/json/state` for device metadata and current state.
- Posts to `/json/state` for control (brightness, color, effects, on/off).
- Posts to `/json/cfg` for provisioning (Wi-Fi credentials, static IP, etc.).

Auto-provisioning applies `defaultStatePayload` and `defaultConfigPatch` from settings to newly discovered devices.

## DMX Features

- **Art-Net**: Sends DMX-over-IP to a target host (configurable IP/port/universe). Packet construction in `dmx/artnet_packet.go`.
- **USB Serial**: Streams DMX512 frames to USB-to-DMX adapters. Live output runs in a background worker with channel-based slot updates.
- **Fixtures**: Frontend defines fixture profiles (channel maps, color wheels, gobos). Live controls (faders, XY pad for pan/tilt) send updates to the backend which writes to the DMX universe.

Fixture state is persisted to `dmx.json`. The backend emits fixture definitions and current slot values in snapshots.

## State Persistence

User data is stored in platform-specific directories (via `os.UserConfigDir()`):
- **`state.json`**: Controller settings (AP config, WLED/DMX settings, discovered devices).
- **`general-tab-state.json`**: UI preset state (brightness, RGB, effect selection).
- **`dmx.json`**: DMX fixture definitions and slot values.

Settings are loaded on startup and saved on every user-initiated change.

## Key Conventions

- **RPC methods**: Defined in `internal/service/goldbuslightservice.go`. Return `(ResultType, error)`. Always context-aware with timeouts.
- **Snapshot pattern**: The controller maintains an internal snapshot (`ControllerSnapshot` struct) which aggregates all subsystem state. The frontend never mutates this directly; it triggers RPC calls which return updated snapshots.
- **Feature flags**: WLED, DMX, and AP features are independently toggleable in settings. Check `snapshot.Settings.WLED.Enabled`, `snapshot.Settings.DMX.Enabled`, etc. before rendering UI or executing backend logic.
- **Error handling**: Backend logs errors and returns them to the frontend. The frontend displays errors in toasts (via `sonner`). Critical errors (e.g., network apply failures) are surfaced in the settings UI with retry prompts.
- **Styling**: TailwindCSS with custom theme variables. Dark mode is not currently implemented but is planned.

## Building for Production

Wails handles asset embedding and binary generation. The `dist_embed.go` file embeds the frontend build output. Run `task <os>:build DEV=false` to produce a production binary with minified assets.

## Testing

Go tests exist for utility functions (e.g., `internal/wledhttp/host_test.go`). Add tests in `*_test.go` files alongside the code. Run with `go test ./...`.

Frontend has no test suite yet; consider adding Vitest/React Testing Library if expanding UI logic.

## Notes for Future Development

- **Bindings**: Wails generates TypeScript bindings for Go types and RPC methods. Regenerate with `wails3 task common:generate:bindings` after changing service signatures.
- **Cross-compilation**: Use the Docker-based cross-compilation setup (`task setup:docker`, `task build:docker`) for building binaries on platforms you don't have access to.
- **Server mode**: The app supports headless server mode (no GUI, HTTP API only). Build with `task build:server`, run with `task run:server`.
- **Updates**: The app used to have in-app update functionality, but this was removed in favor of scripted updates on Raspberry Pi. The update button is now hidden in the UI.

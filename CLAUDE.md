# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Goldbus Light Controller is a **Wails v3** desktop app for controlling WLED LED devices and DMX fixtures in a specific venue ("Goldbus"). It is also deployable as a headless HTTP server (server mode) or on a Raspberry Pi as a kiosk.

## Development commands

```bash
# Run in dev mode (hot-reload frontend + Go backend)
wails3 dev -config ./build/config.yml -port 9245
# or equivalently:
task dev

# Build for current platform (native binary)
task build                        # auto-detects OS
task linux:build DEV=false        # explicit Linux
task darwin:build DEV=false       # macOS
task windows:build DEV=false      # Windows

# Server mode (no GUI, serves HTTP only; uses 'server' build tag)
task build:server
task run:server

# Regenerate Go→TypeScript bindings after changing exported service methods
wails3 generate bindings -f '' -clean=true -ts ./cmd/... ./internal/...

# Frontend only
cd frontend && npm install && npm run build

# Run Go tests
go test ./internal/...            # all packages
go test ./internal/controller/... # single package
```

**Prerequisites:** `wails3` CLI, `go`, `node`/`npm`. On Linux, CGO is required for native builds; Docker (`task build:docker`) handles cross-compilation.

## Architecture

### Backend (Go)

The Go module (`goldbus`) is structured around a single `WLEDController` in `internal/controller/controller.go`, which owns all runtime state. The controller:
- Discovers WLED devices via mDNS/Zeroconf (`internal/discovery/`)
- Sends JSON commands to WLED devices via HTTP (`internal/wled/engine.go` — goroutine dispatcher + worker pool)
- Controls DMX fixtures over USB serial (`internal/serial/`) and Art-Net UDP (`internal/dmx/artnet_packet.go`)
- Manages "Party mode" — an audio-reactive DMX automation loop (`internal/controller/dmx_party.go`)
- Persists state to `UserConfigDir/wled-controller/` as JSON files: `state.json`, `dmx.json`, `general-tab-state.json`

`internal/service/goldbuslightservice.go` is the **Wails service layer** — every exported method on `GoldbusLightService` becomes an RPC callable from the frontend. The `withControllerResult`/`withController` generic helpers enforce a consistent pattern: require an initialized controller, run a func, return a `ControllerSnapshot`.

Events emitted to the frontend (registered in `main.go`):
- `controller:snapshot` — full `ControllerSnapshot` every second
- `controller:error` — error string
- `time` — current time string (heartbeat)

Logging is tee'd to stderr and `UserConfigDir/wled-controller/app.log` via `internal/logging/`. Set `GOLDBUS_LOG_FILE` to override the path. Set `GOLDBUS_FULLSCREEN=1` for fullscreen startup (Pi kiosk mode).

Platform-specific code uses build tags: `internal/network/network_linux.go`, `network_darwin.go`, `network_windows.go`; similarly for `internal/serial/`.

The `console.Bus` (`internal/console/console.go`) is an in-memory ring buffer that all transports (WLED HTTP, USB-DMX, Art-Net) write to; the UI polls it to render a live transport console.

### Frontend (React + TypeScript)

**Bindings** — `wails3 generate bindings` produces `frontend/bindings/` with strongly typed TypeScript wrappers for every exported Go service method. Import from `../../bindings/goldbus/internal/service/goldbuslightservice` etc. Never hand-write these.

**State management** — single Zustand store in `frontend/src/store/controllerStore.ts`. The main orchestrator hook `frontend/src/hooks/useControllerApp.ts` calls Wails RPC, updates the store, and drives all child components via props (not context).

**Routing** — client-side only via a `DetailRoute` discriminated union in `frontend/src/types/controller.ts`. Routes: `presets`, `settings`, `device`, `dmxUniverse`, `dmxAddFixture`, `dmxFixture`. The URL query `?view=console-window` activates the detached console window mode.

**UI library** — shadcn/ui components (Radix UI + Tailwind CSS v4) in `frontend/src/components/ui/`. 3D fixture previews use `@react-three/fiber` + Three.js (`frontend/src/components/dmx/3D/`).

**Key types** are defined once in `frontend/src/types/controller.ts` and mirror the Go structs in `internal/controller/controller.go`.

## Key constraints

- **Bindings are generated** — do not manually edit `frontend/bindings/`. Re-run `wails3 generate bindings` after changing any exported service method signature or adding new exported methods.
- **Controller snapshot is the source of truth** — the backend emits a full `ControllerSnapshot` every second; UI state should derive from snapshots, not from optimistic local mutations.
- **DMX addresses are 1-indexed** (1–512); UI and backend both use this convention consistently.
- The `server` build tag disables Wails/CGO GUI and enables a pure HTTP server path — keep server-mode-incompatible code behind the tag.
- WLED devices use 2.4 GHz Wi-Fi only; the Access Point must stay on 2.4 GHz channels (1–14).

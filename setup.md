# Goldbus Light — setup

System packages and tools needed to **develop**, **build**, and **run** Goldbus Light Controller locally.

## Toolchain (all platforms)

Install these first; versions should match CI when possible.

| Tool | Version (reference) | Notes |
|------|-------------------|--------|
| [Go](https://go.dev/dl/) | 1.26.x (`go.mod` pins 1.26.1) | Required for backend and `wails3` CLI |
| [Node.js](https://nodejs.org/) | 20.x LTS | npm for `frontend/` |
| [Task](https://taskfile.dev/) | 3.x | `task dev`, `task build`, etc. |
| [Wails v3 CLI](https://v3.wails.io/) | v3.0.0-alpha.x | Install after Go: `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |

Ensure `$(go env GOPATH)/bin` is on your `PATH` so `wails3` is found.

Optional but useful:

- **Git** — clone and release workflows  
- **Docker** — cross-compilation via `task build:docker` (not required for native dev on your OS)

---

## Linux — desktop development (build)

Native Linux builds use **CGO** (GTK + WebKit for Wails). You need compiler tooling and **-dev** headers, not only runtime libraries.

### Fedora / RHEL / CentOS Stream

```bash
sudo dnf install -y \
  gcc gcc-c++ pkg-config \
  gtk3-devel \
  webkit2gtk4.1-devel \
  libappindicator-gtk3 \
  nodejs npm \
  golang
```

### Debian / Ubuntu (incl. CI)

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  build-essential pkg-config \
  libgtk-3-dev libwebkit2gtk-4.1-dev \
  nodejs npm \
  golang-go
```

On Debian/Ubuntu, if the distro Go is too old, install Go from [go.dev](https://go.dev/dl/) instead of `golang-go`.

---

## Linux — runtime (running the app)

These are needed on a machine that **runs** the built binary (dev or release), in addition to the GUI libraries Wails links against.

### GUI (Wails)

| Package (Debian/Ubuntu) | Package (Fedora) | Purpose |
|-------------------------|------------------|---------|
| `libgtk-3-0` | `gtk3` | GTK windowing |
| `libwebkit2gtk-4.1-0` | `webkit2gtk4.1` | Embedded webview |
| `libayatana-appindicator3-1` | `libappindicator-gtk3` | Tray / app indicator (if used) |
| `xdg-utils` | `xdg-utils` | Desktop integration |

Raspberry Pi installs pull these via `scripts/install-raspberry-pi.sh` (Debian packages).

### Party mode — audio capture (Linux only)

On Linux, party **audio** mode uses **PipeWire/PulseAudio CLI tools**, not in-process malgo (avoids signal-handler conflicts with WebKit on Go 1.26+).

| Command | Typical package (Fedora) | Typical package (Debian/Ubuntu) | Purpose |
|---------|--------------------------|----------------------------------|---------|
| `pactl` | `pipewire-pulseaudio` or `pulseaudio-utils` | `pulseaudio-utils` | List inputs, default source |
| `pw-record` | `pipewire-utils` | `pipewire-utils` | Capture PCM for the equalizer / party worker |

**Fedora example:**

```bash
sudo dnf install -y pipewire pipewire-pulseaudio pipewire-utils
```

**Debian/Ubuntu example:**

```bash
sudo apt-get install -y pipewire pipewire-pulseaudio pipewire-utils
```

Verify:

```bash
pactl get-default-source
pw-record --version
```

If party audio fails with “device not found”, open **Party** in the app and **reselect** the input: device IDs are Pulse source names (e.g. `alsa_input…`), not malgo hex IDs from other platforms.

### Wi‑Fi access point (optional)

Settings that apply a Wi‑Fi AP profile on Linux expect **NetworkManager**:

| Command | Package (Fedora) | Package (Debian/Ubuntu) |
|---------|------------------|-------------------------|
| `nmcli` | `NetworkManager` | `network-manager` |

### USB DMX (optional)

USB serial adapters use kernel `ttyUSB` / `ttyACM` nodes; ensure your user can access the port (e.g. `dialout` group on Linux). No extra Go packages at OS level beyond a working serial device.

---

## macOS — development

- **Xcode Command Line Tools:** `xcode-select --install`
- **Go**, **Node**, **Task**, **wails3** (see toolchain above)
- Party audio on macOS still uses **malgo** (bundled via Go); no `pactl` / `pw-record` required

---

## Windows — development

- **Go**, **Node**, **Task**, **wails3**
- WebView2 runtime (usually already present on Windows 11)
- Party audio uses **malgo** on Windows; no PipeWire tools

---

## Frontend dependencies

After Node is installed:

```bash
cd frontend && npm install
```

Or let Task install them: `task install:frontend:deps`.

---

## Quick start (after setup)

```bash
# From repo root
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
task dev
# or: wails3 dev -config ./build/config.yml -port 9245
```

Regenerate TypeScript bindings after changing exported Go service methods:

```bash
wails3 generate bindings -f '' -clean=true -ts ./cmd/... ./internal/...
```

Run Go tests:

```bash
go test ./internal/...
```

---

## Raspberry Pi

Runtime GUI packages are installed by the Pi installer; see [README.md](README.md#raspberry-pi-setup). Use the **linux-arm64** release asset on **64-bit** Raspberry Pi OS. For party audio on the Pi, install the same PipeWire/Pulse tools as in the table above if they are not already present.

---

## Environment variables (optional)

| Variable | Effect |
|----------|--------|
| `GOLDBUS_LOG_FILE` | Override log file path (default: user config dir) |
| `GOLDBUS_FULLSCREEN=1` | Start fullscreen (kiosk / Pi) |

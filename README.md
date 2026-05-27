# Goldbus Light Controller

Wails v3 desktop app for controlling WLED lights in the Goldbus environment.

## Development

See **[setup.md](setup.md)** for OS packages (GTK/WebKit, PipeWire audio tools, NetworkManager, toolchain versions).


- Run in dev mode:
  - `wails3 dev`
- Build native binary:
  - `task linux:build DEV=false` (Linux)
  - `task darwin:build DEV=false` (macOS)
  - `task windows:build DEV=false` (Windows)

## Kotlin Multiplatform Desktop rewrite

This branch starts the Kotlin Multiplatform replacement under `composeApp/`.
It uses Gradle, Compose Multiplatform Desktop, Material 3, kotlinx.serialization,
kotlinx.coroutines `StateFlow`, and Ktor CIO for WLED HTTP control.

- Run desktop tests:
  - `./gradlew :composeApp:desktopTest`
- Run the Compose Desktop app:
  - `./gradlew :composeApp:run`
- Package for the current OS:
  - `./gradlew :composeApp:packageDistributionForCurrentOS`

The first ported runtime slice loads the existing `wled-controller/state.json`
and `general-tab-state.json` files, renders a Compose Desktop WLED presets UI,
supports manual/simulated WLED devices, and POSTs global state to WLED
`/json/state`. DMX, Art-Net, USB-DMX, Party mode, discovery, and 3D previews
have Kotlin domain models in place and are the next backend/UI slices to fill in.

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

### Updating to a new release

Updates are no longer applied from inside the app. To install a release on the Pi by tag:

```bash
sudo ./scripts/install-release.sh v0.0.19
```

What the script does:

- downloads `GoldbusLight-linux-arm64` from `https://github.com/0x49b/GoldbusLight/releases/download/<tag>/`,
- stops the running service (`goldbuslight.service`, user-mode by default),
- replaces `/opt/goldbuslight/GoldbusLight` atomically (keeps `GoldbusLight.previous` for rollback),
- restarts the service.

Same env overrides as the installer apply: `GOLDBUS_USER`, `GOLDBUS_INSTALL_DIR`, `GOLDBUS_SERVICE_MODE` (`user` or `system`). Override the asset name or repo with `--asset` / `--repo` if needed.

Rolling back:

```bash
sudo systemctl --user --machine=pi@ stop goldbuslight.service
sudo mv /opt/goldbuslight/GoldbusLight.previous /opt/goldbuslight/GoldbusLight
sudo systemctl --user --machine=pi@ start goldbuslight.service
```

### Fullscreen startup

Fullscreen is controlled by `/etc/default/goldbuslight`:

```bash
GOLDBUS_FULLSCREEN=1
```

If display artifacts appear until manual resize, this is often a Raspberry Pi WebKit/GTK compositor startup quirk. Restarting the app/session typically helps.

# GoldbusLight → Kotlin Multiplatform / Compose Desktop port

Target: Raspberry Pi 5 running 64-bit Raspberry Pi OS (Bookworm, `linux-arm64`), with the same kiosk-style fullscreen UX the current Wails build provides. UI library: [compose-fluent/compose-fluent-ui](https://github.com/compose-fluent/compose-fluent-ui).

---

## 1. What the current app actually is

A single-binary desktop controller for WLED light strips on a private Wi-Fi (the Pi is both the controller and the AP that WLED clients join).

### 1.1 Backend (Go, single `main` package)

| File | Responsibility |
| ---- | -------------- |
| `main.go` | Wails v3 entrypoint, embeds `frontend/dist`, registers `GreetService`, emits `controller:snapshot` every second. |
| `controller.go` (~1.9k LOC) | The whole domain model: `WLEDController`, settings, devices map, persistence, `WLEDEngine` HTTP client, restore-on-boot, simulation device. |
| `discovery.go` / `discovery_subnet.go` | Active mDNS pulls (`hashicorp/mdns`) and passive browse (`grandcat/zeroconf`) over `_wled._tcp` + `_http._tcp`, optional `/24` ARP-style subnet probe when AP is on. |
| `network_{linux,darwin,windows,stub}.go` | `networkBackend` interface; **production path is `nmcli` on Linux** (creates a 2.4 GHz AP, `802-11-wireless.mode ap`, `ipv4.method shared`). |
| `internal/wledhttp` | URL helpers (mDNS host fallback to direct IP). |
| `greetservice.go` | Public RPC surface bound to JS via Wails generated bindings. |
| `logging.go` | File logger. |

Persistent state: JSON at `os.UserConfigDir()/wled-controller/state.json` (mode 0600), schema v2 with settings + devices + per-device `lastState`.

Background goroutines started by `controller.Start`:
- `discoveryLoop` (active mDNS, interval = 15s normally, 5s when AP enabled)
- `discoveryBrowseLoop` (passive zeroconf, restarts on settings change)
- `subnetProbeLoop` (every 120s when AP+probe enabled)
- `persistenceLoop` (30s)
- `healthLoop` (30s GET `/json/state` per known device)
- `restoreLastStatesOnBoot` (one-shot, replays `lastState` per device after 2s)

### 1.2 RPC surface (`GreetService`)

`Greet`, `AppVersion`, `GetControllerSnapshot`, `DefaultControllerSettings`, `SaveControllerSettings`, `ApplyNetworkSettings`, `DiscoverDevicesNow`, `SetDeviceState`, `SetGlobalState`, `ProvisionDevice`, `RefreshDevice`, `GetDeviceDetail`, `RemoveDevice`, `GetIgnoredDevices`, `SetDeviceIgnored`, `RenameDevice`, `ControllerSummary` — 17 endpoints. Most return a `ControllerSnapshot` so the UI can re-render.

### 1.3 Frontend (React + TS + Vite + Tailwind/daisyUI)

- `App.tsx` — three-route shell (presets / settings / device).
- `hooks/useControllerApp.ts` (~700 LOC) — owns *all* state: snapshot polling (every 8s), `controller:snapshot` push subscription, device-detail polling (5s), throttled auto-apply of slider edits (16 ms throttle), optimistic patches and reconciliation against incoming GET state, debounced color preset apply.
- `components/device/DeviceDetailView.tsx` (~37 KB) — segment editor, FX/palette picker modals, brightness/transition sliders, color picker, rename, ignore/remove, provision.
- `components/presets/GeneralPanel.tsx` — global on/off, brightness, RGB, named-color presets (warm/cold white, etc. from `lib/wled.ts`), FX/Pal/SX/IX.
- `components/settings/ControllerSettingsView.tsx` — AP form, discovery toggles, provisioning JSON editors, ignored devices list.
- `components/layout/AppShell.tsx` — header (Discover/Refresh), left sidebar (General + devices + Settings).

### 1.4 Pi deployment

- `scripts/install-raspberry-pi.sh` — installs `libgtk-3-0`, `libwebkit2gtk-4.1-0`, `libayatana-appindicator3-1`; drops a launch wrapper that waits for the X socket; writes a systemd user unit (default) or system unit; `loginctl enable-linger`; menu entry only (no desktop icon).
- `scripts/install-release.sh` — replaces `/opt/goldbuslight/GoldbusLight` from a GitHub release tag, atomic with `.previous` rollback.
- Fullscreen via `GOLDBUS_FULLSCREEN=1` (`/etc/default/goldbuslight`).

### 1.5 Behaviours that *must* survive the port

- Devices always come back to where the user left them (lastState replay).
- Sliders feel "live" but never flood the strip (16 ms throttle + optimistic state + reconciliation against device state).
- mDNS uses the AP interface when AP is on, falls back to direct IP when `.local` stalls (~4 s).
- AP is always 2.4 GHz, channel clamped to 1–14.
- Settings JSON file is forward-compatible (versioned).

---

## 2. compose-fluent-ui — fit & caveats

| | |
| ---- | ---- |
| Coordinates | `io.github.compose-fluent:fluent:0.1.0`, `io.github.compose-fluent:fluent-icons-extended:0.1.0` (Maven Central) |
| Min Kotlin / Compose | Kotlin 2.2.0, Compose Multiplatform 1.8.2 |
| Targets | desktop (JVM, all OSes), Android, iOS x64/arm64/sim, wasmJs, js |
| License | Apache 2.0 (Fluent icons MIT) |
| Status | **Experimental** ("any API would be changed in the future without any notification"). |

**Components we need are present:** `NavigationView` / `SideNav` (sidebar), `ColorPicker` (compound + basic), `Slider` (brightness/SX/IX), `ComboBox` + `ListItem` + `Expander` (effect/palette pickers, settings cards), `ContentDialog` + `InfoBar` (modals + error toast replacing `alert-error`), `ToggleSwitch` (on/off and sync), `Card`, `ProgressRing` (replace daisyUI loading spinner), `TextField`, `Button` variants.

**Risk for Pi 5 / linux-arm64:**

- compose-fluent-ui ships pure JVM bytecode → arch-agnostic per se. No published linux-arm64 binary release for the gallery, **only** an x64 `.deb`.
- Transitive `chrisbanes/haze` (acrylic/mica blur) and `net.java.dev.jna:jna-jpms` need `linux-aarch64` natives. JNA ships aarch64; haze is Compose/Skia code and depends on Skiko.
- **The real arm64 risk is Skiko** (Compose Desktop's Skia binding), not the Fluent library. JetBrains publishes `skiko-awt-runtime-linux-arm64`. We must (a) use Compose Multiplatform ≥ 1.6 which has stable arm64 Skiko, and (b) verify GPU/EGL on Pi 5's V3D Mesa driver — fall back to `-Dskiko.renderApi=SOFTWARE` if the OpenGL backend misbehaves under Wayland/X11 on Bookworm.
- **No tray/indicator parity**: drop `libayatana-appindicator3-1` from install script.

---

## 3. Target architecture

```
GoldbusLight-kmp/
├── settings.gradle.kts
├── build.gradle.kts                  # root, shared versions
├── gradle/libs.versions.toml         # Kotlin 2.2.0, Compose 1.8.2, fluent 0.1.0
├── shared/                           # KMP module (commonMain only for now)
│   └── src/commonMain/kotlin/io/goldbus/light/
│       ├── domain/                   # Settings, Device, Snapshot, GeneralTabState (data classes)
│       ├── wled/                     # WledClient (Ktor), payload helpers (warm/cold white, rgbState)
│       ├── discovery/                # DiscoveryEngine interface (impl in :app for JmDNS)
│       ├── network/                  # NetworkBackend interface
│       ├── persistence/              # StateRepository + GeneralTabRepository (kotlinx.serialization JSON)
│       └── controller/               # WledController (StateFlow-based)
├── app/                              # JVM-only, Compose Desktop
│   └── src/jvmMain/kotlin/io/goldbus/light/app/
│       ├── Main.kt                   # application { Window { ... } }, fullscreen toggle
│       ├── network/LinuxNmcliBackend.kt
│       ├── network/StubBackend.kt
│       ├── discovery/JmDnsDiscovery.kt
│       └── ui/
│           ├── theme/                # FluentTheme wiring
│           ├── shell/AppShell.kt
│           ├── presets/GeneralPanel.kt
│           ├── settings/SettingsPanel.kt
│           └── device/DeviceDetailPanel.kt
├── scripts/                          # adapted install scripts (no GTK/WebKit deps)
└── packaging/                        # jpackage configs
```

### 3.1 Module layout rationale

- **`shared` is `commonMain`-only** even though we only target JVM today. Keeps the door open for the gallery wasm/Android targets later and forces a clean split between domain and host bindings (mDNS, nmcli, file IO).
- **`app` is `jvmMain`-only.** All JVM/host concerns (JmDNS, ProcessBuilder for `nmcli`, AWT window, jpackage) live here.

### 3.2 Key library swaps

| Concern | Go / Wails today | KMP / Compose target |
| ------- | ---------------- | -------------------- |
| HTTP client | `net/http` | Ktor client (CIO engine on JVM) |
| JSON | `encoding/json` + `map[string]any` | kotlinx.serialization with `JsonObject` for the WLED state blob (preserves "everything") |
| mDNS active | `hashicorp/mdns` | `org.jmdns:jmdns:3.5.9` |
| mDNS passive | `grandcat/zeroconf` | `JmDNS.addServiceListener` (same lib) |
| Subnet probe | Goroutines + raw HTTP | `kotlinx.coroutines` + Ktor with `Dispatchers.IO` semaphore |
| State snapshot push | Wails event `controller:snapshot` | `MutableStateFlow<ControllerSnapshot>` collected by Compose `collectAsState()` |
| Persistence | `os.UserConfigDir` + `os.WriteFile(..., 0600)` | `java.nio.file.Files.write` + `PosixFilePermissions` (0600), location via `xdg-config` resolver (`$XDG_CONFIG_HOME` or `~/.config`) |
| AP control | `nmcli` via `os/exec` | `ProcessBuilder("nmcli", …)` — same args, same flow, returns `NetworkApplyResult` |
| Logging | stdlib `log` + custom file logger | `kotlin-logging` + Logback (rolling file) |
| Bindings to UI | Wails generated TS | Direct function calls (no IPC) |

### 3.3 State model (Compose-friendly)

`WledController` exposes:

```kotlin
class WledController(
    private val scope: CoroutineScope,
    private val wled: WledClient,
    private val discovery: DiscoveryEngine,
    private val network: NetworkBackend,
    private val statePersistence: StateRepository,
    private val generalTabPersistence: GeneralTabRepository,
) {
    val snapshot: StateFlow<ControllerSnapshot>
    val errors:   SharedFlow<String>

    suspend fun discoverNow(): List<WledDevice>
    suspend fun setDeviceState(id: String, patch: JsonObject)
    suspend fun setGlobalState(patch: JsonObject): Map<String, String>
    suspend fun applyNetwork(): NetworkApplyResult
    // ... 1:1 with GreetService
}
```

The four background loops become `scope.launch` jobs. `mu sync.RWMutex` becomes a single `Mutex` around an internal `var state: ControllerState` that is republished to `_snapshot.value` after each mutation. Callers in Compose UI just `controller.snapshot.collectAsState()`.

### 3.4 WLED state blob

The Go side carries the device JSON as `map[string]any` so it never has to know every WLED field. In Kotlin we use `kotlinx.serialization.json.JsonObject` directly for `lastState`, GET `/json/state`, etc. — same intent, same loose schema. Helper functions in `shared/wled/Patches.kt` mirror `lib/wled.ts` (`warmWhiteState`, `coldWhiteState`, `rgbState`, `mainSegIndex`, `segmentAt`, `mergeStateIntoLastState`, `mergeSegJSON`).

### 3.5 UI mapping

| Today (React + daisyUI) | Compose + compose-fluent-ui |
| ----------------------- | --------------------------- |
| `AppShell` header + sidebar (`btn-primary`, `btn-ghost`) | `NavigationView` with `MenuItem` per device (status dot via `Badge`); top bar = `Row` with `AccentButton("Discover")`, `Button("Refresh")` |
| `discovering` modal | `ContentDialog` with `ProgressRing` |
| `error` red bar (`alert alert-error`) | `InfoBar(severity = InfoBarSeverity.Critical)` |
| Brightness/SX/IX sliders | `Slider` (with manual throttle of 16 ms as today) |
| RGB picker | `ColorPicker` (compound) — model maps directly to `[R,G,B]` IntArray |
| FX/Palette modal pickers | `ContentDialog` containing a `ListView` (search field on top) |
| JSON editor textareas (settings) | `TextField(multiLine = true, fontFamily = monospace)` |
| Tab routes | Replaced by selected `NavigationView` item; URL routing not needed |
| daisyUI `toggle` for AP/sim | `ToggleSwitch` |
| `loading-spinner` per-action busy | per-button `loadingState` → swap label with `ProgressRing` |

### 3.6 Concurrency / "live slider" parity

- Reuse the Go strategy: optimistic local state, `Mutex`-guarded last-pending-patch, reconciliation when GET state lags.
- Use `MutableStateFlow<DeviceFormState>` + `collectLatest { delay(16); apply() }` for slider throttling — equivalent to the React `setTimeout` trick but without the stale-closure pitfalls.
- Direct-IP-first POST `/json/state` heuristic from `requestJSONWithDeviceFallback` ports verbatim into `WledClient.applyState`.

### 3.7 Fullscreen / kiosk

```kotlin
fun main() = application {
    val fullscreen = System.getenv("GOLDBUS_FULLSCREEN") == "1"
    val state = rememberWindowState(
        placement = if (fullscreen) WindowPlacement.Fullscreen else WindowPlacement.Floating
    )
    Window(onCloseRequest = ::exitApplication, state = state, title = "Goldbus Licht Controller") {
        FluentTheme(colors = if (isSystemInDarkTheme()) darkColors() else lightColors()) {
            App(controller)
        }
    }
}
```

---

## 4. Raspberry Pi 5 specifics

### 4.1 Runtime

- **JDK 21 LTS** (`temurin-21-jdk` from Adoptium's Debian repo, or `openjdk-21-jre-headless` from Bookworm — *not* headless because we need AWT). Compose 1.8 supports JDK 17+; pick 21 for ZGC and crisp jpackage support.
- **Skiko native:** comes from `org.jetbrains.skiko:skiko-awt-runtime-linux-arm64` (transitively pulled by Compose). Confirm it's present in the lockfile.
- **GPU path:** Pi 5 uses V3D Mesa. Default Skiko OpenGL backend works on Wayland (Wayfire / labwc) on Bookworm. Fallback: set `SKIKO_RENDER_API=SOFTWARE` in `/etc/default/goldbuslight` if rendering glitches appear.
- **Fonts:** install `fonts-noto-core` so Fluent's segoe-style fallbacks render Latin/symbols correctly (Pi OS Lite-derived images are missing them).

### 4.2 Packaging

Two viable paths — pick **(B)** for the smallest install footprint:

**(A) Distributable image via Compose `createDistributable`** — produces `app/build/compose/binaries/main/app/GoldbusLight/` with a runtime image (jlink-trimmed JRE) plus the jar. Easy, zero JDK on host.

**(B) `jpackage` `--type app-image`** — same shape but allows `--linux-shortcut`, `--linux-app-category`. Use this. Build with cross-compile from a Pi (or in CI on `linux/arm64` runner) since `jpackage` needs the native toolchain matching the target.

Either way the deliverable is a tarball/`.tgz` of an `app-image` directory. Replace `install-release.sh` to:

1. Download `GoldbusLight-linux-arm64.tar.gz` from GitHub release.
2. Extract atomically into `/opt/goldbuslight.new`, swap with `/opt/goldbuslight` (keep `/opt/goldbuslight.previous`).
3. Restart `goldbuslight.service`.

### 4.3 Removing Wails-only system deps

`install-raspberry-pi.sh` must drop `libgtk-3-0`, `libwebkit2gtk-4.1-0`, `libayatana-appindicator3-1`. Replace with:

```
libfreetype6 libfontconfig1 libxrender1 libxi6 libxtst6 libxrandr2 \
libxcursor1 libxinerama1 libxext6 libgl1 libglx-mesa0 fonts-noto-core
```

Keep the rest of the script (systemd user unit, linger, `launch.sh` X-socket wait, `/etc/default/goldbuslight`). The launch wrapper still works — just exec the jpackage binary instead of `GoldbusLight`.

### 4.4 systemd unit changes

```ini
ExecStart=/opt/goldbuslight/bin/GoldbusLight
Environment=DISPLAY=:0
Environment=GDK_BACKEND=x11        # if Pi runs Wayland but app is X11-better
Environment=SKIKO_RENDER_API=OPENGL
EnvironmentFile=-/etc/default/goldbuslight
```

---

## 5. Implementation plan (phased)

Each phase is independently shippable. Estimates are person-days for one engineer comfortable with Kotlin + Compose; halve them with pair work.

### Phase 0 — Bootstrapping (0.5 d)

- New module layout, `gradle/libs.versions.toml`, JDK 21 toolchain, Compose 1.8.2, Kotlin 2.2.0, fluent 0.1.0.
- Smoke "Hello Fluent" `Window` builds and runs locally on macOS dev machine.
- CI matrix: macOS (dev convenience) + `linux/arm64` job that runs `./gradlew :app:createDistributable` (use `docker buildx` / GitHub-hosted arm64 runner).

### Phase 1 — Domain + persistence (1 d)

Port pure-data, no UI:
- `ControllerSettings`, `AccessPointSettings`, `DiscoverySettings`, `ProvisioningSettings`, `TestingSettings`, `WledDevice`, `WledDeviceDetail`, `ControllerSnapshot`, `GeneralTabState`, `ControllerCapabilities` — 1:1 from the Go structs. Use `@Serializable` with `@SerialName` so the persisted JSON file matches today's schema (so a Pi can be migrated by just dropping in the new binary).
- `StateRepository` + `GeneralTabRepository` — read/write at `XDG_CONFIG_HOME/wled-controller/state.json` and `general-tab-state.json`, mode 0600. Implement schema-version migration (`Version < 2` → set `passiveBrowse = true`, `pollIntervalSecondsWhenApEnabled = 5`).
- `defaultControllerSettings()`, `mergeWithDefaults`, `clampAccessPointTo24GHz`, `defaultGeneralTabState`, `clampGeneralTabState`, `mergeGeneralTabState` — direct ports.
- Unit tests: load old state.json fixtures, round-trip equality.

**Done when:** loading a Pi's existing `state.json` produces identical settings/devices to the Go binary.

### Phase 2 — WLED HTTP client (1 d)

- `WledClient` using Ktor + `JsonObject`.
  - `inspect(candidate)`, `getState`, `getFullJson`, `getConfig`, `applyState`, `applyCfgPatch`, `provision`.
  - Direct-IP-first POST `/json/state` heuristic (~4s `.local` stall avoidance) — port `requestJSONWithDeviceFallback` exactly.
- Helpers `wledhttp.HostForHTTP`, `BaseHTTPURL` → `WledHostResolver` object in shared.
- `mergeStateIntoLastState` + `mergeSegJSON` ports with kotlinx.serialization.
- Unit tests with `MockEngine` covering: timeout fallback, `seg` array merge, `on:"t"` toggle skip-merge.

### Phase 3 — Discovery (1.5 d)

- `discovery/DiscoveryEngine` interface (commonMain).
- JVM impl `JmDnsDiscovery` using `org.jmdns:jmdns`.
  - Active `discoverOnce(timeout)` over `_wled._tcp` + `_http._tcp`; iface-bind via `JmDNS.create(InetAddress)` resolved from `NetworkInterface.getByName(ap.interfaceName)`.
  - Passive browse: `addServiceListener` per service type, restart only when settings signature changes (mirror `discoveryBrowseSignature`).
- Subnet probe: enumerate `/24` from interface IPv4, throttle 40 concurrent via `Semaphore(40)`, GET `/json` and treat non-error as candidate.
- Probe-dedupe map with TTL (port `consumeInspectThrottle` — `Mutex` + `Map<String, Long>`).

**Done when:** stand a real WLED-capable device on the LAN, discovery populates the snapshot in ≤ 15 s.

### Phase 4 — Network backend (Linux nmcli) (0.5 d)

- `NetworkBackend` interface + `LinuxNmcliBackend` and `StubBackend`. Pick at runtime via `System.getProperty("os.name")`.
- `apply()` runs the same `nmcli connection add / modify / up` sequence with `ProcessBuilder`. Capture stdout+stderr, success per step, dry-run when `nmcli` is absent.
- Capabilities reporter mirrors `controllerCapabilities()`.

### Phase 5 — Controller orchestration (1.5 d)

- `WledController` with `StateFlow<ControllerSnapshot>` and four `scope.launch` loops (discoveryActive, discoveryBrowse, persistence, health).
- One-shot `restoreLastStatesOnBoot` after 2 s.
- `setDeviceState`, `setGlobalState`, `provisionDevice`, `refreshDevice`, `getDeviceDetail`, `removeDevice`, `setDeviceIgnored`, `renameDevice`, `discoverNow`, `applyNetwork`, `saveSettings`.
- Simulated WLED device behind `Settings.Testing.SimulateWLED` (port `newSimulatedWLEDDevice` + canned effects/palettes lists).
- `errors: SharedFlow<String>` so the UI can surface what today comes through `controller:error`.

**Done when:** controller (no UI) runs from a `main()` in `app/`, discovers devices, persists state, and a CLI `--toggle` flag can flip `on:"t"` on every device.

### Phase 6 — UI shell + presets (2 d)

- `App.kt` mirrors `App.tsx`: route is a `var route by remember { mutableStateOf<Route>(Route.Presets) }`.
- `AppShell` using `NavigationView` (left) + top header (Discover/Refresh + status string). Per-device `MenuItem` with green/grey dot.
- `GeneralPanel`: `ToggleSwitch` (master on/off), `Slider` (brightness), `ColorPicker` (RGB), preset buttons (warm/cold white + named colours from `Palettes.kt`), FX/Pal/SX/IX controls (`ComboBox` for FX/Pal opening a `ContentDialog` with searchable list).
- Discovery modal → `ContentDialog` with `ProgressRing`.
- Error bar → `InfoBar`.

**Done when:** the General tab can drive a real WLED strip end-to-end with the same feel as today.

### Phase 7 — Settings panel (1 d)

- Form for `AccessPointSettings` (TextFields + 2.4 GHz channel `Slider` 1–14).
- `Discovery` settings (toggles + numeric fields).
- Provisioning JSON editors (`TextField` multiline, monospace) with parse-on-blur and inline error.
- Ignored devices list with "Restore" button per row.
- "Apply network settings" button → `applyNetwork()`, results rendered in an `Expander` per command (output, success).

### Phase 8 — Device detail (3 d)

The largest port (the Go file is small, but `DeviceDetailView.tsx` is 37 KB of UI logic).

- Segment selector (`SelectorBar`).
- Per-segment FX picker (`ContentDialog` + searchable list).
- Per-segment palette picker (same).
- Brightness, SX, IX sliders.
- Color picker (per segment, `ColorPicker`).
- Transition slider.
- Rename (inline `TextField` with confirm/cancel buttons).
- Provision / Ignore / Remove (`ContentDialog` confirms).
- Auto-apply throttling: `MutableStateFlow<DeviceForm>` collected with `debounce(16.milliseconds)` + the same "block while `on==false`" gating as the React hook.
- Pending-patch reconciliation against incoming GET state (mirror `pendingUiPatchRef` + `isPatchSatisfiedByState`).

### Phase 9 — Pi packaging & install (1 d)

- Add Compose `application { nativeDistributions { targetFormats(...) } }` block; produce `app-image`.
- Rewrite `scripts/install-raspberry-pi.sh`: drop GTK/WebKit deps, install `libfreetype6 libfontconfig1 libxrender1 libxi6 libxtst6 libxrandr2 libxcursor1 libxinerama1 libxext6 libgl1 libglx-mesa0 fonts-noto-core openjdk-21-jre`, point `launch.sh` at the new binary, keep the systemd user unit.
- `install-release.sh`: download `.tar.gz`, extract atomically, `.previous` rollback.
- Update `/etc/default/goldbuslight` template to add `SKIKO_RENDER_API=OPENGL` and (optional) `GDK_BACKEND=x11` for Wayland sessions.

### Phase 10 — Pi smoke test & tuning (1 d)

- Real Pi 5 + WLED strip end-to-end:
  - Cold start → fullscreen → discovery in < 15 s → restore lastState.
  - Slider drag for 30 s, verify no slowdown / no dropped frames at SOFTWARE renderer; switch to OPENGL, verify GPU-backed.
  - AP toggle on a freshly-imaged Pi → `nmcli` creates the AP, WLED node connects.
  - Verify state.json migration from a Go-built install.
- File issues for any compose-fluent-ui glitches (it's experimental; expect 1–2).

### Phase 11 — CI / release (0.5 d)

- GitHub Actions: matrix builds for `linux/arm64` (using `setup-java@v4` + `actions/upload-artifact`), produce `GoldbusLight-linux-arm64.tar.gz` per release tag.
- Tag-driven release pipeline so `install-release.sh v0.1.0` keeps working.

**Total:** ~13 person-days, parallelisable into ~8 calendar days with two engineers.

---

## 6. Open questions / risks

1. **compose-fluent-ui maturity.** v0.1.0 with explicit "API will change" notice. If the project stalls before we ship, fork the components we need (~30 files). Mitigation: pin to a commit SHA, vendor a copy in `vendor/fluent` if needed.
2. **Skiko on Pi 5.** No published end-user reports we found; needs an empirical pass on real hardware (Phase 10). Worst case: ship with `SKIKO_RENDER_API=SOFTWARE` (Pi 5's CPU is fast enough for a controller UI at 1080p).
3. **JmDNS vs hashicorp/mdns parity.** JmDNS's iface binding is one-iface-per-instance; matches our use. Sub-millisecond timing differences in mDNS retry cadence are not user-visible.
4. **JSON schema preservation.** kotlinx.serialization's default is to omit unknown fields on round-trip. We must encode `WledDevice.lastState` as `JsonObject` (not a strict class) and keep `info` likewise loose, or upgrades will silently lose fields.
5. **`UpdaterDiagnosticsService` is not in the current tree** (referenced in memory). The new app simply has no in-app updater (matches commit `8c24b70 Replace in-app self-updater with a tag-based install script`). Just keep `install-release.sh`.
6. **Locale.** UI strings today are German ("Goldbus Licht Controller"); preserve them. Use `compose-resources` for i18n if more languages are needed later.
7. **Fluent ContentDialog vs daisyUI modal-backdrop.** The existing app uses a click-outside modal-backdrop pattern. Fluent's `ContentDialog` is modal by default — fine, but verify keyboard ESC behaviour for the discovery modal.

---

## 7. Things explicitly *not* ported

- `GreetService.Greet` and the `time` event from `main.go` — they're Wails-template demo code.
- Self-updater service / `updaterdiagnosticsservice.go` — already removed in master per commit log.
- macOS / Windows network backends — keep the Go ones around as-is in a `legacy/` folder if reference is wanted, but only ship Linux. Stub backend covers dev on macOS.
- DaisyUI loading-spinner styling, Tailwind utility classes — replaced wholesale by Fluent components.

---

## 8. First commit checklist (when implementation begins)

1. `git switch -c kmp-port`
2. `mkdir GoldbusLight-kmp` sibling tree (don't touch the Go tree until parity is reached).
3. `gradle init --type kotlin-application`, then convert to multi-module per §3.
4. Add `gradle/libs.versions.toml` with kotlin = "2.2.0", compose = "1.8.2", fluent = "0.1.0", ktor = "3.0.x", jmdns = "3.5.9", kotlinx-serialization = "1.7.x", kotlinx-coroutines = "1.9.x", logback = "1.5.x".
5. Phase 0 smoke build: `FluentTheme { ContentDialog("hello") }`.
6. Open a tracking issue with the §5 phase list as checkboxes.

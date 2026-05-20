# Goldbus Light Controller — Kotlin Multiplatform Desktop Migration Plan

## Executive summary

This document describes a full reimplementation of the Goldbus Light Controller as a **Kotlin Multiplatform (KMP) desktop application** targeting macOS, Linux (including Raspberry Pi arm64), and Windows. The existing Go/Wails/React stack is replaced with Kotlin on the backend and Compose Multiplatform on the frontend. The entire feature set is preserved: WLED device control, DMX fixture management, Art-Net output, USB-DMX serial output, audio-reactive Party mode, and network/access-point configuration.

The migration keeps the same architectural shape — a central controller, a service layer, a reactive UI — but maps each Go/React concept to an idiomatic KMP equivalent.

---

## Technology choices

| Concern | Current (Go/Wails) | KMP replacement |
|---|---|---|
| Desktop shell | Wails v3 (Chromium webview) | **Compose Multiplatform** (Skiko/Skia canvas) |
| UI framework | React 18 + shadcn/ui + Tailwind | **Compose Multiplatform** UI components |
| 3D fixture preview | Three.js / react-three-fiber | **OpenGL via LWJGL** or Compose Canvas with software rasterisation |
| State management | Zustand store + snapshot poll | **StateFlow / SharedFlow** inside a `ControllerRepository` |
| HTTP client (WLED) | Go `net/http` goroutine pool | **Ktor client** (coroutine-based) |
| mDNS discovery | grandcat/zeroconf + hashicorp/mdns | **JmDNS** (JVM, cross-platform) |
| UDP (Art-Net) | Go `net.PacketConn` | **Java NIO `DatagramChannel`** via `kotlinx-io` or raw JVM |
| USB serial (DMX) | go.bug.st/serial + CGO | **jSerialComm** (pure JVM, no native build step) |
| Audio capture (Party) | gen2brain/malgo (CGO) | **javax.sound.sampled** (JVM built-in, no CGO) |
| Network/AP control | nmcli / networksetup / netsh via `os/exec` | Same shell invocations via `ProcessBuilder` + `expect`-style wrappers |
| Persistence | JSON files in `UserConfigDir` | **kotlinx.serialization** JSON files in `System.getProperty("user.home")` + platform config dirs |
| Logging | Go `log` + file tee | **SLF4J + Logback** tee to file |
| Build | Taskfile + wails3 CLI | **Gradle** (Kotlin DSL) + conveyor or jpackage for distribution |
| CI cross-compile | Docker (CGO) | Gradle JVM fat-jar; native bundling via jpackage; **no CGO needed** |

**Why Compose Multiplatform and not Electron/Tauri/Flutter?**
- Same language as the backend — no IPC bridge, no serialisation layer, no generated bindings.
- Skia-rendered — pixel-identical on all three platforms.
- True desktop widgets (menus, window decorations, file dialogs) without a browser host.
- jSerialComm and javax.sound remove the only CGO dependencies in the Go build.

---

## Project structure

```
goldbuslight-kmp/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle/
│   └── libs.versions.toml          # version catalog
├── composeApp/
│   ├── src/
│   │   ├── commonMain/kotlin/
│   │   │   ├── controller/         # WLEDController, DMX*, Party* — pure KMP
│   │   │   ├── discovery/          # JmDNS wrapper
│   │   │   ├── dmx/                # ArtNetPacket, DMXLiveOutput
│   │   │   ├── audio/              # PartyFeatures FFT
│   │   │   ├── console/            # ConsoleBus ring buffer
│   │   │   ├── network/            # NetworkBackend interface
│   │   │   ├── serial/             # USBSerialDevice interface
│   │   │   ├── persistence/        # JSON persistence managers
│   │   │   ├── logging/            # Logging init
│   │   │   └── ui/                 # All Compose screens and components
│   │   ├── desktopMain/kotlin/
│   │   │   ├── Main.kt             # entry point, window setup
│   │   │   ├── network/            # NetworkBackend platform impls
│   │   │   └── serial/             # jSerialComm USBSerial impl
│   │   └── desktopTest/kotlin/
│   │       ├── controller/         # controller tests
│   │       └── dmx/                # artnet / party tests
│   └── build.gradle.kts
└── scripts/                        # install-raspberry-pi.sh, install-release.sh (unchanged)
```

> **Desktop-only scope**: `desktopMain` is the only platform target. `commonMain` holds everything that is not JVM-API-specific. This leaves the door open for future mobile without restructuring.

---

## Phase 1 — Project skeleton and toolchain (week 1)

### 1.1 Gradle setup

`settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories { gradlePluginPortal(); mavenCentral() }
}
plugins {
    id("org.jetbrains.kotlin.multiplatform") version "2.1.0" apply false
    id("org.jetbrains.compose") version "1.7.3" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}
rootProject.name = "GoldbusLight"
include(":composeApp")
```

`gradle/libs.versions.toml` (key entries):
```toml
[versions]
kotlin = "2.1.0"
compose = "1.7.3"
ktor = "3.1.0"
kotlinx-serialization = "1.8.0"
kotlinx-coroutines = "1.10.1"
jmdns = "3.5.9"
jserialcomm = "2.11.0"
slf4j = "2.0.16"
logback = "1.5.16"

[libraries]
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-cio  = { module = "io.ktor:ktor-client-cio",  version.ref = "ktor" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
kotlinx-coroutines-swing = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-swing", version.ref = "kotlinx-coroutines" }
jmdns = { module = "org.jmdns:jmdns", version.ref = "jmdns" }
jserialcomm = { module = "com.fazecast:jSerialComm", version.ref = "jserialcomm" }
slf4j-api = { module = "org.slf4j:slf4j-api", version.ref = "slf4j" }
logback-classic = { module = "ch.qos.logback:logback-classic", version.ref = "logback" }
```

### 1.2 Compose desktop window

`desktopMain/Main.kt`:
```kotlin
fun main() = application {
    val controller = remember { WLEDController().also { it.start() } }
    val fullscreen = System.getenv("GOLDBUS_FULLSCREEN") == "1"

    Window(
        onCloseRequest = { controller.stop(); exitApplication() },
        title = "Goldbus Licht Controller",
        state = rememberWindowState(
            width = 1400.dp, height = 788.dp,
            placement = if (fullscreen) WindowPlacement.Fullscreen else WindowPlacement.Floating
        )
    ) {
        GoldbusApp(controller)
    }
}
```

**Deliverable**: app opens a blank window and closes cleanly.

---

## Phase 2 — Core domain models (week 1–2)

Translate all Go structs to `@Serializable` Kotlin data classes. These live in `commonMain/controller/`.

```kotlin
// controller/Models.kt
@Serializable
data class WLEDDevice(
    val id: String,
    val name: String,
    val host: String,
    val address: String,
    val port: Int,
    val lastSeen: Instant,
    val online: Boolean,
    val provisioned: Boolean,
    val ignored: Boolean = false,
    val info: Map<String, JsonElement> = emptyMap(),
    val lastState: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class DMXFixture(
    val id: String,
    val type: DMXFixtureType,
    val brand: String,
    val name: String,
    val dmxAddress: Int,           // 1-indexed, 1–512
    val movingHead: MovingHeadConfig = MovingHeadConfig(),
    val channels: List<DMXChannel> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable
enum class DMXFixtureType {
    colorChanger, dimmer, effect, fan, flower, hazer, laser,
    ledBarBeams, ledBarPixels, movingHead, other, scanner, smoke, strobe
}

// ControllerSnapshot, DMXState, DMXPartyState, ControllerSettings, etc.
// — direct Kotlin equivalents of the Go structs in controller/controller.go
```

All `JsonElement` fields replace Go's `map[string]any` and support arbitrary WLED JSON payloads.

**Deliverable**: all domain types compile; `kotlinx.serialization` round-trip tests pass.

---

## Phase 3 — Persistence layer (week 2)

Mirrors Go's three `PersistenceManager` types. Uses `kotlinx.serialization` instead of `encoding/json`.

```kotlin
// persistence/StatePersistence.kt
class StatePersistenceManager {
    private val path: Path = platformConfigDir() / "wled-controller" / "state.json"
    private val mutex = Mutex()

    suspend fun load(): PersistentState = mutex.withLock { /* readFile + decode */ }
    suspend fun save(state: PersistentState) = mutex.withLock { /* encode + writeFile */ }
}

// persistence/DMXPersistence.kt  — same pattern for dmx.json
// persistence/GeneralTabStatePersistence.kt — same pattern for general-tab-state.json

fun platformConfigDir(): Path = when {
    System.getProperty("os.name").startsWith("Windows") ->
        Path(System.getenv("APPDATA") ?: System.getProperty("user.home"))
    System.getProperty("os.name").startsWith("Mac") ->
        Path(System.getProperty("user.home")) / "Library" / "Application Support"
    else ->
        Path(System.getenv("XDG_CONFIG_HOME") ?: (System.getProperty("user.home") + "/.config"))
}
```

Schema migration (version 1→2→3) is reproduced as a migration function operating on decoded `JsonObject` before re-decoding to typed classes, matching the Go migration logic exactly.

**Deliverable**: app loads and saves settings and DMX state across restarts.

---

## Phase 4 — WLED HTTP engine (week 2–3)

Replaces `internal/wled/engine.go`. Uses Ktor coroutine client instead of goroutine dispatcher + worker pool.

```kotlin
// controller/WLEDEngine.kt
class WLEDEngine(
    private val console: ConsoleBus,
    private val logger: Logger,
) {
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json() }
        engine { requestTimeout = 8_000 }
    }
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // One coroutine per device, dispatched on the IO pool — equivalent to Go worker pool
    fun submitState(device: WLEDDevice, state: Map<String, JsonElement>) {
        scope.launch {
            runCatching {
                client.post("http://${device.address}:${device.port}/json/state") {
                    contentType(ContentType.Application.Json)
                    setBody(state)
                }
            }.onSuccess { resp ->
                console.publish(Entry(transport = "wled", direction = "out", target = device.address, summary = "state applied"))
            }.onFailure { ex ->
                console.publish(Entry(transport = "wled", direction = "error", summary = ex.message ?: "unknown"))
            }
        }
    }

    fun inspect(device: WLEDDevice): InspectResult { /* GET /json */ }
    fun stop() { scope.cancel(); client.close() }
}
```

**Deliverable**: can send a brightness/colour command to a real WLED device.

---

## Phase 5 — mDNS discovery (week 3)

Replaces `internal/discovery/discovery.go`. JmDNS is a mature JVM mDNS library.

```kotlin
// discovery/Discovery.kt
class DiscoveryRunner(private val settings: DiscoverySettings) {
    suspend fun discoverOnce(timeoutMs: Long): List<DiscoveredDevice> = withTimeout(timeoutMs) {
        val jmdns = JmDNS.create()
        val results = mutableListOf<DiscoveredDevice>()
        try {
            for (type in settings.serviceTypes) {   // e.g. "_wled._tcp.local."
                val latch = CountDownLatch(1)
                jmdns.addServiceListener(type, object : ServiceListener {
                    override fun serviceResolved(event: ServiceEvent) {
                        val info = event.info
                        results += DiscoveredDevice(
                            name    = info.name,
                            host    = info.server,
                            address = info.inetAddresses.firstOrNull()?.hostAddress ?: return,
                            port    = info.port,
                        )
                    }
                    override fun serviceAdded(event: ServiceEvent) {}
                    override fun serviceRemoved(event: ServiceEvent) {}
                })
                delay(timeoutMs)
            }
        } finally {
            jmdns.close()
        }
        results
    }
}
```

Subnet probe fallback (`discovery_subnet.go`) is ported as a parallel HTTP ping sweep over `Dispatchers.IO`.

**Deliverable**: `DiscoverNow()` returns real WLED devices on the LAN.

---

## Phase 6 — Art-Net UDP output (week 3)

Replaces `internal/dmx/artnet_packet.go` + the UDP send loop in the controller.

```kotlin
// dmx/ArtNet.kt
object ArtNet {
    fun buildArtDMXPacket(universe: ByteArray, sequence: Byte, net: Int, subnet: Int, universeId: Int): ByteArray {
        require(universe.size == 512)
        return ByteBuffer.allocate(530).apply {
            put("Art-Net ".toByteArray(Charsets.US_ASCII))
            put(0x00); put(0x50)   // OpDMX
            put(0x00); put(0x0e)   // protocol version 14
            put(sequence)
            put(0)
            put(((subnet and 0x0f shl 4) or (universeId and 0x0f)).toByte())
            put((net and 0x7f).toByte())
            put(0x02); put(0x00)   // length hi/lo (512)
            put(universe)
        }.array()
    }
}

// dmx/ArtNetSender.kt
class ArtNetSender(private val settings: ArtNetSettings) {
    private val socket = DatagramSocket()

    fun send(universe: ByteArray, sequence: Byte) {
        val packet = ArtNet.buildArtDMXPacket(universe, sequence, settings.net, settings.subnet, settings.universe)
        socket.send(DatagramPacket(packet, packet.size, InetAddress.getByName(settings.targetHost), settings.port))
    }

    fun close() = socket.close()
}
```

**Deliverable**: Art-Net packets arrive at QLC+ or a WLED Art-Net target.

---

## Phase 7 — USB serial DMX output (week 3–4)

Replaces `internal/serial/` + CGO. **jSerialComm** is a pure-JVM library with pre-built native shims for Linux/macOS/Windows/arm64 — no CGO compile step.

```kotlin
// serial/USBSerial.kt  (desktopMain)
object USBSerialLister {
    fun list(): List<USBSerialDevice> =
        SerialPort.getCommPorts().map { port ->
            USBSerialDevice(
                id          = port.systemPortPath,
                path        = port.systemPortPath,
                name        = port.descriptivePortName,
                description = port.portDescription,
            )
        }
}

class DMXSerialOutput(portPath: String) : Closeable {
    private val port = SerialPort.getCommPort(portPath).apply {
        setBaudRate(250_000)
        setNumDataBits(8)
        setNumStopBits(SerialPort.TWO_STOP_BITS)
        setParity(SerialPort.NO_PARITY)
        openPort()
    }

    fun send(universe: ByteArray) {
        require(universe.size == 512)
        // DMX512 framing: BREAK (88µs low), MAB (8µs high), START byte 0x00, 512 slots
        // jSerialComm exposes setBreakSignal(); timing matches the Go implementation
        port.setBreakSignal(true)
        Thread.sleep(0, 88_000)   // 88µs break
        port.setBreakSignal(false)
        Thread.sleep(0, 8_000)    // 8µs MAB
        port.writeBytes(byteArrayOf(0x00) + universe, 513L)
    }

    override fun close() = port.closePort().let { Unit }
}
```

macOS path alias logic (`serial_write_path_darwin.go` maps `/dev/tty.*` ↔ `/dev/cu.*`) is reproduced as a simple string replacement in `DMXSerialOutput` port resolution.

**Deliverable**: live DMX output drives a real fixture over USB.

---

## Phase 8 — Audio capture and Party mode (week 4)

### 8.1 Audio capture

Replaces `internal/audio/capture.go` (gen2brain/malgo CGO).  
`javax.sound.sampled` is part of the JVM standard library.

```kotlin
// audio/AudioCapture.kt
class AudioCapture(
    private val deviceId: String?,
    private val onSamples: (ShortArray) -> Unit,
) {
    private val bufferMs = 50
    private var line: TargetDataLine? = null
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        val format = AudioFormat(44100f, 16, 1, true, false)
        val info = DataLine.Info(TargetDataLine::class.java, format)
        line = (AudioSystem.getLine(info) as TargetDataLine).also { it.open(format); it.start() }
        val bufSize = (44100 * 2 * bufferMs / 1000)
        val buf = ByteArray(bufSize)
        job = scope.launch(Dispatchers.IO) {
            while (isActive) {
                val n = line!!.read(buf, 0, buf.size)
                if (n > 0) {
                    val shorts = ShortArray(n / 2) { i ->
                        ((buf[i * 2 + 1].toInt() shl 8) or (buf[i * 2].toInt() and 0xff)).toShort()
                    }
                    onSamples(shorts)
                }
            }
        }
    }

    fun stop() { job?.cancel(); line?.stop(); line?.close() }
}

fun listAudioInputDevices(): List<DMXPartyAudioInputDevice> =
    AudioSystem.getMixerInfo().mapNotNull { info ->
        val mixer = AudioSystem.getMixer(info)
        if (mixer.targetLineInfo.isEmpty()) return@mapNotNull null
        val name = info.name
        DMXPartyAudioInputDevice(
            id         = info.name,
            name       = name,
            isDefault  = false,
            isLoopback = name.contains("loopback", ignoreCase = true),
            isBuiltin  = name.contains("built", ignoreCase = true),
            isUSB      = name.contains("usb", ignoreCase = true),
        )
    }
```

### 8.2 FFT / feature extraction

`internal/audio/features.go` is a self-contained Cooley-Tukey FFT + band splitting. Port it directly to Kotlin (no dependency needed):

```kotlin
// audio/PartyFeatures.kt
data class PartyFeatures(val level: Double, val bass: Double, val mid: Double, val treble: Double, val beat: Double)

fun extractPartyFeatures(samples: ShortArray): PartyFeatures {
    // identical algorithm to the Go implementation:
    // 1. compute RMS level
    // 2. apply Hann window over first 512 samples
    // 3. in-place Cooley-Tukey FFT
    // 4. split magnitude spectrum into bass/mid/treble bands
    // 5. return clamped normalized values
}
```

### 8.3 Party mode loop

`internal/controller/dmx_party.go` is a ticker loop (~30 fps) that:
1. Reads latest audio features
2. Selects which channels to animate per fixture type (profiles in `dmx_party_profiles.go`)
3. Writes DMX values and sends them via USB + Art-Net

```kotlin
// controller/DMXParty.kt
class DMXPartyRunner(
    private val config: StateFlow<DMXPartyConfig>,
    private val fixtures: StateFlow<List<DMXFixture>>,
    private val onPatch: suspend (List<DMXOutputUpdate>) -> Unit,
    private val onAudioFeatures: (DMXPartyAudioFeatures) -> Unit,
) {
    private var job: Job? = null
    private val tickMs = 33L   // ~30 fps

    fun start(scope: CoroutineScope) {
        job = scope.launch {
            while (isActive) {
                val cfg = config.value
                val features = currentAudioFeatures.value
                val patches = computePartyFrame(cfg, fixtures.value, features)
                onPatch(patches)
                delay(tickMs)
            }
        }
    }

    fun stop() { job?.cancel() }
}
```

The profile logic in `dmx_party_profiles.go` (`partyAllowsChannel`, `partyMovingHeadChannel`, etc.) translates to a `when` expression with the same channel-type string matching.

**Deliverable**: Party mode animates physical DMX fixtures with audio-reactive patterns.

---

## Phase 9 — WLEDController (week 4–5)

The central controller in `controller/WLEDController.kt` replaces the 1500-line `internal/controller/controller.go`. It owns all subsystems and exposes a single `StateFlow<ControllerSnapshot>` to the UI.

```kotlin
class WLEDController {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val _snapshot = MutableStateFlow(ControllerSnapshot.empty())
    val snapshot: StateFlow<ControllerSnapshot> = _snapshot.asStateFlow()

    private val persistence   = StatePersistenceManager()
    private val dmxPersistence = DMXPersistenceManager()
    private val console       = ConsoleBus(max = 500)
    private val engine        = WLEDEngine(console)
    private val networkMgr    = NetworkManager()

    // Discovery loop — equivalent to the Go background goroutine
    // DMX live output — starts/stops on demand
    // Party mode runner — starts/stops on demand
    // Snapshot emission — tick every 1s via a coroutine

    fun start() { /* load persisted state, start discovery loop, emit snapshots */ }
    fun stop()  { scope.cancel() }

    suspend fun discoverNow(): List<WLEDDevice> { ... }
    suspend fun setDeviceState(deviceId: String, state: Map<String, JsonElement>): ControllerSnapshot { ... }
    suspend fun setGlobalState(state: Map<String, JsonElement>): Map<String, String> { ... }
    // ... all other methods matching GoldbusLightService in Go
}
```

The snapshot is emitted every second from a `while(isActive) { delay(1000); _snapshot.value = buildSnapshot() }` coroutine, replacing the Go `time.Sleep` loop in `main.go`.

**Key invariants preserved**:
- Controller snapshot is the single source of truth
- DMX addresses are 1-indexed (1–512) throughout
- Party mode blocks manual DMX patch while running

---

## Phase 10 — Network/access-point backend (week 5)

Replaces `internal/network/network_linux.go` / `network_darwin.go` / `network_windows.go`. The same shell commands are used; `ProcessBuilder` replaces `os/exec`.

```kotlin
// network/NetworkBackend.kt  (commonMain)
interface NetworkBackend {
    val id: String
    val label: String
    val available: Boolean
    val primaryCli: String
    val unavailableHint: String
    fun apply(ctx: CoroutineContext, settings: ControllerSettings): NetworkApplyResult
}

// network/NmcliBackend.kt  (desktopMain — Linux)
// network/DarwinBackend.kt  (desktopMain — macOS)
// network/NetshBackend.kt   (desktopMain — Windows)

fun selectNetworkBackend(): NetworkBackend = when {
    System.getProperty("os.name").startsWith("Linux")   -> NmcliBackend()
    System.getProperty("os.name").startsWith("Mac")     -> DarwinBackend()
    System.getProperty("os.name").startsWith("Windows") -> NetshBackend()
    else                                                 -> StubBackend()
}

fun runShellCommand(vararg args: String): NetworkCommandResult {
    val proc = ProcessBuilder(*args).redirectErrorStream(true).start()
    val output = proc.inputStream.bufferedReader().readText()
    val exitCode = proc.waitFor()
    return NetworkCommandResult(command = args.joinToString(" "), output = output.trim(), success = exitCode == 0)
}
```

**Deliverable**: Settings → Network tab applies nmcli / networksetup / netsh commands.

---

## Phase 11 — ConsoleBus (week 5)

Direct port of `internal/console/console.go`. The ring-buffer logic is identical; JVM `ReentrantLock` replaces `sync.Mutex`.

```kotlin
// console/ConsoleBus.kt
class ConsoleBus(val max: Int = 500) {
    private val lock = ReentrantLock()
    private val entries = ArrayDeque<Entry>(max + 1)
    private val nextId = AtomicLong(1)

    fun publish(entry: Entry) = lock.withLock {
        entries.addLast(entry.copy(id = nextId.getAndIncrement()))
        while (entries.size > max) entries.removeFirst()
    }

    fun list(afterId: Long, limit: Int): List<Entry> = lock.withLock {
        entries.filter { it.id > afterId }.take(limit.coerceIn(1, 500))
    }

    fun clear() = lock.withLock { entries.clear() }
}
```

---

## Phase 12 — Compose UI (weeks 5–8)

This is the largest phase. The React component tree maps to Compose `@Composable` functions with near-identical hierarchy.

### Navigation / routing

```kotlin
// ui/AppShell.kt
@Composable
fun AppShell(controller: WLEDController) {
    val snapshot by controller.snapshot.collectAsState()
    var route by remember { mutableStateOf<Route>(Route.Presets) }

    Row {
        SideNav(route = route, onNavigate = { route = it }, snapshot = snapshot)
        Box(modifier = Modifier.weight(1f)) {
            when (val r = route) {
                is Route.Presets     -> if (snapshot.settings.wled.enabled) GeneralPanel(...)
                is Route.Settings    -> ControllerSettingsView(...)
                is Route.Device      -> DeviceDetailView(deviceId = r.id, ...)
                is Route.DmxUniverse -> if (snapshot.settings.dmx.enabled) DMXUniverseView(...)
                is Route.DmxFixture  -> DMXFixtureEditorView(fixtureId = r.id, ...)
                is Route.DmxAdd      -> DMXFixtureEditorView(fixtureId = null, ...)
            }
        }
    }
}

sealed interface Route {
    data object Presets : Route
    data object Settings : Route
    data class  Device(val id: String) : Route
    data object DmxUniverse : Route
    data object DmxAdd : Route
    data class  DmxFixture(val id: String) : Route
}
```

### Screen mapping

| React component | Compose equivalent |
|---|---|
| `GeneralPanel.tsx` | `ui/wled/GeneralPanel.kt` |
| `DeviceDetailView.tsx` | `ui/device/DeviceDetailView.kt` |
| `ControllerSettingsView.tsx` | `ui/settings/ControllerSettingsView.kt` |
| `TransportConsolePanel.tsx` | `ui/settings/TransportConsolePanel.kt` |
| `DMXUniverseView.tsx` | `ui/dmx/DMXUniverseView.kt` |
| `DMXFixtureEditorView.tsx` | `ui/dmx/DMXFixtureEditorView.kt` |
| `DMXFixtureLiveControls.tsx` | `ui/dmx/DMXFixtureLiveControls.kt` |
| `DMXPartyPanel.tsx` | `ui/dmx/DMXPartyPanel.kt` |
| `AppShell.tsx` | `ui/AppShell.kt` |

### shadcn/ui → Compose Material 3

The React app uses shadcn/ui (Radix UI + Tailwind). Replace with **Compose Material 3** components:

| shadcn component | Material 3 / Compose |
|---|---|
| `Button` | `Button`, `OutlinedButton`, `TextButton` |
| `Dialog` | `AlertDialog` / `BasicAlertDialog` |
| `Slider` | `Slider` |
| `Switch` | `Switch` |
| `Input` | `OutlinedTextField` |
| `Select / Combobox` | `ExposedDropdownMenuBox` |
| `Card` | `Card` (M3) |
| `Badge` | Custom `Box` with `RoundedCornerShape` |
| `Accordion` | Custom expandable `Column` |
| HueSlider | Custom `Canvas`-based slider |

Use `MaterialTheme` with a dark scheme for the main UI; match the existing app's neutral dark-background style.

### DMX Universe grid

`dmxUniverseGrid.ts` renders a 32×16 slot grid. In Compose:

```kotlin
@Composable
fun DMXUniverseGrid(fixtures: List<DMXFixture>, liveUniverse: IntArray?, onSelectFixture: (DMXFixture) -> Unit) {
    val occupancy = remember(fixtures) { buildSlotOccupancy(fixtures) }
    LazyVerticalGrid(columns = GridCells.Fixed(32)) {
        items(512) { slot ->
            val address = slot + 1   // 1-indexed
            val fixtureIds = occupancy[address]
            SlotCell(address = address, fixtureIds = fixtureIds, liveValue = liveUniverse?.getOrNull(slot))
        }
    }
}
```

### 3D fixture preview

The React app uses Three.js + react-three-fiber for moving-head and smoke previews. Options in Compose:

**Option A (recommended):** Embed a lightweight LWJGL OpenGL canvas inside a `Canvas` composable using `SwingPanel`. Write the moving-head and smoke visualisations in JOML + LWJGL. This matches the existing Three.js quality.

**Option B (simpler):** Use Compose `Canvas` with software 2D projection for the moving-head beam. Acceptable for the Raspberry Pi (avoids OpenGL driver issues). Implement `DMXMovingHeadPreview2D` with an orthographic beam drawn as a gradient `Path`.

Recommendation: Start with Option B for Pi compatibility; add Option A as a quality upgrade gated on `GL_AVAILABLE` detection.

### Audio fader, knob, XY-pad

`frontend/src/components/audio/` — port to Compose `Canvas`-based custom components. The knob is a rotary control drawn with `drawArc`; the fader is a vertical `Slider` with custom track; the XY-pad is a `Box` with `pointerInput`.

---

## Phase 13 — Logging (week 5)

Replaces `internal/logging/logging.go`. Logback tees to stderr and a file.

`src/desktopMain/resources/logback.xml`:
```xml
<configuration>
    <appender name="STDERR" class="ch.qos.logback.core.ConsoleAppender">
        <target>System.err</target>
        <encoder><pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern></encoder>
    </appender>
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${GOLDBUS_LOG_FILE:-${user.home}/.config/wled-controller/app.log}</file>
        <encoder><pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level %logger{36} - %msg%n</pattern></encoder>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${user.home}/.config/wled-controller/app.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>10MB</maxFileSize>
            <maxHistory>7</maxHistory>
        </rollingPolicy>
    </appender>
    <root level="INFO">
        <appender-ref ref="STDERR"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

---

## Phase 14 — Simulation / testing modes (week 6)

The Go controller supports `simulateWled` and `simulateUsbDmx` flags in settings that inject fake devices. Preserve these in Kotlin:

```kotlin
// controller/WLEDController.kt
private fun maybeInjectSimulatedDevices() {
    if (state.settings.wled.testing.simulateWled) {
        val sim = WLEDDevice(id = "sim:wled", name = "Simulated WLED", ...)
        devices["sim:wled"] = sim
    }
    if (state.settings.dmx.testing.simulateUsbDmx) {
        usbSerialDevices += USBSerialDevice(id = "sim:usb-dmx512", path = "sim://usb-dmx512", name = "Simulated USB-DMX512")
    }
}
```

Unit tests for controller logic use `simulateWled = true` to avoid needing real hardware. Tests for the DMX party algorithm and Art-Net packet builder have no external dependencies.

---

## Phase 15 — Distribution and Raspberry Pi (week 7)

### jpackage fat-jar → native installer

```kotlin
// composeApp/build.gradle.kts
compose.desktop {
    application {
        mainClass = "MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Deb, TargetFormat.Rpm, TargetFormat.Dmg, TargetFormat.Msi)
            packageName = "GoldbusLight"
            packageVersion = "1.0.0"
            linux { iconFile.set(file("../build/appicon.png")) }
            macOS { iconFile.set(file("../build/appicon.icns")) }
            windows { iconFile.set(file("../build/appicon.ico")) }
        }
    }
}
```

`./gradlew packageDeb` → produces `GoldbusLight_1.0.0_arm64.deb` for Raspberry Pi.

### Raspberry Pi arm64

The JVM (Temurin / Amazon Corretto 21) is available for `linux-arm64`. jSerialComm ships arm64 native shims. javax.sound.sampled works on Pi with the ALSA backend.

The existing `scripts/install-raspberry-pi.sh` and `scripts/install-release.sh` need only minor changes:
- Replace the binary path from `GoldbusLight` to `GoldbusLight.jar` or wrap the jpackage-produced launcher.
- The systemd service unit and `GOLDBUS_FULLSCREEN` env var are unchanged.
- The `.desktop` file is unchanged.

---

## Phase 16 — Import/export (week 7)

The existing "import/export feature" (commit `2464649`) — likely fixture/settings JSON export — maps to Compose `FileDialog` (AWT) or the `kotlinx.io` + standard file chooser:

```kotlin
// Compose desktop file picker (AWT interop)
val fileChooser = remember { JFileChooser() }
Button(onClick = {
    if (fileChooser.showSaveDialog(null) == JFileChooser.APPROVE_OPTION) {
        val json = Json.encodeToString(ControllerSettings.serializer(), settings)
        fileChooser.selectedFile.writeText(json)
    }
}) { Text("Export settings") }
```

---

## Phased delivery summary

| Week | Deliverable |
|---|---|
| 1 | Gradle project, Compose window opens, CI builds fat-jar |
| 1–2 | All domain models compile; persistence round-trips |
| 2–3 | WLED HTTP engine sends commands to real devices |
| 3 | mDNS discovery finds devices; Art-Net packets verified with Wireshark |
| 3–4 | USB-DMX output drives real fixture; device listing works on all 3 OSes |
| 4 | Audio capture, FFT, Party mode loop animates fixtures |
| 4–5 | Full WLEDController: discovery loop, snapshot emission, all service methods |
| 5 | Network/AP backend; ConsoleBus; logging |
| 5–8 | Full Compose UI (all screens) |
| 7 | jpackage `.deb` runs on Raspberry Pi arm64 |
| 7 | Import/export |
| 8 | Polish, simulation mode tests, parity check against Go app |

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `javax.sound.sampled` loopback capture missing on macOS (CoreAudio restriction) | Medium | Offer BlackHole virtual audio device in docs; same caveat exists on the Go/malgo path |
| jSerialComm DMX timing accuracy (88µs break) | Medium | jSerialComm's `setBreakSignal` + `Thread.sleep` with `TimeUnit.NANOSECONDS` is sufficient for DMX; validate against a protocol analyser |
| Pi Skia/Compose rendering performance | Low-Medium | Compose 1.7 ships a software Skia fallback; test at 1400×788 on Pi 4 and Pi 5 |
| mDNS on Linux with AP enabled (same as Go) | Low | Same subnet-probe fallback logic is ported; documented in Go CLAUDE.md |
| JmDNS vs. grandcat/zeroconf feature parity | Low | JmDNS is the de-facto JVM mDNS library; service-type filtering and passive browse are both supported |

---

## What is NOT changing

- The JSON persistence file format and paths — existing installs keep their state.
- The Art-Net packet wire format (byte-for-byte identical, covered by unit test).
- DMX 1-indexed address convention.
- Raspberry Pi install scripts, systemd service, `.desktop` file, fullscreen env var.
- The `GOLDBUS_LOG_FILE` env var for log path override.

# Library Alternatives for KMP Project

**Exported:** 5/20/2026 17:09:15  
**Link:** [https://gemini.google.com/app/568f774c6977cdbe](https://gemini.google.com/app/568f774c6977cdbe)

## Prompt:
You said

check me if there are better libraries then the suggest ones in the document

## Response:
This is an incredibly well-thought-out and pragmatic migration plan. Your technology choices strongly lean toward standard, modern KMP and JVM tools, which minimizes friction and removes the CGO cross-compilation headaches you currently have in Go.

However, there are a few areas where you can swap out manual implementations or older JVM libraries for modern, purpose-built multiplatform solutions that will save you significant boilerplate.

Here is an evaluation of your choices and recommendations for better alternatives.

### 1\. Persistence Layer (Phase 3)

*   **Your Plan:** Manual `Mutex` + `kotlinx.serialization` + standard File IO (`StatePersistenceManager`).
    
*   **Better Alternative:** **Jetpack DataStore (Preferences or Typed)**
    
    *   **Why it's better:** Google recently made DataStore fully Kotlin Multiplatform. Writing your own file-based mutex persistence is prone to race conditions, partial writes, or file corruption during unexpected shutdowns. DataStore gives you asynchronous, transactional, and consistent data storage out of the box. It handles file corruption gracefully and exposes a `Flow` natively, mapping perfectly to your `ControllerRepository` architecture.
        

### 2\. UI Navigation / Routing (Phase 12)

*   **Your Plan:** A manual `sealed interface Route` + `var route by remember { mutableStateOf(...) }`.
    
*   **Better Alternative:** **Voyager** or **Decompose**
    
    *   **Why it's better:** While a simple `remember` state works for small apps, it breaks down quickly when you need back-stack management, deep linking, or nested routing (e.g., inside the DMX Editor).
        
    *   **Recommendation:** Use **Voyager**. It is extremely lightweight, feels very similar to React Router, and doesn't dictate your entire architectural pattern (unlike Decompose, which is incredibly robust but has a steeper learning curve).
        

### 3\. Audio Capture & FFT (Phase 8)

*   **Your Plan:** `javax.sound.sampled` + custom Cooley-Tukey FFT written from scratch.
    
*   **Better Alternative:** **TarsosDSP** or **JTransforms**
    
    *   **Why it's better:** While `javax.sound.sampled` is fine for raw capture, DSP (Digital Signal Processing) and windowing are notoriously tricky to get right. **TarsosDSP** is a pure Java library that handles capture, Hann windowing, and FFT calculation flawlessly.
        
    *   If you *only* want the math portion without the audio capture wrapper, **JTransforms** is an open-source, highly optimized pure-Java FFT library that will outperform a manual Kotlin port of a Cooley-Tukey algorithm.
        

### 4\. 3D Fixture Preview (Phase 12)

*   **Your Plan:** Raw OpenGL via LWJGL or Compose Canvas 2D projection.
    
*   **Better Alternative:** **Korge** (for KMP) or **Filament** (by Google)
    
    *   **Why it's better:** Writing bare-metal OpenGL via LWJGL for a simple moving-head beam visualization is an enormous amount of boilerplate compared to Three.js.
        
    *   **Recommendation:** If you want 3D, look at **Google's Filament**, which is a real-time physically based rendering engine with excellent Java bindings. If you want something lighter and purely multiplatform, **Korge** is a 2D/3D engine for Kotlin that integrates easily and handles the math and matrices for you.
        

### 5\. Distribution / Packaging (Phase 15)

*   **Your Plan:** Gradle native distributions (`jpackage`) or Conveyor.
    
*   **Better Alternative:** Lean exclusively into **Conveyor** (by Hydraulic).
    
    *   **Why it's better:** You mentioned CI cross-compilation. `jpackage` **cannot cross-compile**. If you use `jpackage`, you must run a macOS runner to build the DMG/pkg, and a Windows runner to build the MSI. Conveyor is deeply integrated with Compose Multiplatform and can build signed macOS apps, Windows installers, and Linux deb/rpm packages *all from a single Linux CI runner*. It also gives you auto-updates out of the box, completely replacing your `install-release.sh` shell scripts.
        

### What You Should Absolutely Keep

Your instincts on these replacements are spot-on, and you should not change them:

*   **jSerialComm:** The absolute gold standard for serial communication on the JVM. Do not look for alternatives. It will handle the DMX timing perfectly.
    
*   **Ktor Client (CIO):** Perfect choice for WLED communication. It integrates natively with Coroutines and avoids blocking threads.
    
*   **JmDNS:** Even though it's older, it remains the most reliable pure-JVM mDNS library. Since you are building a JVM desktop app (and not iOS/Android), you don't need a newer native KMP wrapper for this.
    

Would you like me to draft a quick example of how your Controller's state management would look using Jetpack DataStore instead of the manual Mutex approach?

## Prompt:
You said

Why Voyager and not Navigation3

## Response:
That is a completely valid question. JetBrains and Google have recently put a lot of effort into porting Android’s official Jetpack Navigation (often referred to in the community as Navigation Compose or the newer Navigation 3 updates) to Kotlin Multiplatform. It is a highly robust, officially supported library.

However, for **Goldbus Light Controller**—specifically a desktop-first KMP application—Voyager remains the more pragmatic and frictionless choice.

Here is exactly why I recommend Voyager over Jetpack Navigation for this specific architecture:

### 1\. Passing Complex Objects (The Dealbreaker)

In Jetpack Navigation, your navigation graph is driven by routes. Even with the new type-safe routing, you are fundamentally restricted to passing primitive data types or fully serializable objects through the route string/bundle. If you want to navigate to the `DMXFixtureEditorView`, Jetpack Navigation encourages you to pass the `fixtureId` as a string and re-fetch the `DMXFixture` object from your repository once the screen loads.

Voyager abandons the route-string concept entirely. Screens are just standard Kotlin classes. You can pass fully instantiated, complex objects—even active `StateFlow` instances or hardware interfaces—directly into the constructor:

Kotlin

```
// Voyager makes this perfectly legal and easy:
navigator.push(DMXFixtureEditorScreen(
    fixture = activeFixture, 
    liveController = controller // Passing a whole class instance!
))
```

For a desktop application managing live hardware state, this avoids a massive amount of serialization boilerplate and repository lookups.

### 2\. Decentralized Screens vs. Centralized NavHost

Jetpack Navigation requires a centralized `NavHost` where you register every single route in a massive configuration block. As your application grows (adding panels, settings, fixture profiles), this routing file becomes a bottleneck.

Voyager uses a decentralized `Screen` interface. You don't register routes; you just tell the navigator to push a screen onto the stack. It maps almost perfectly to the mental model of the React component tree you are migrating away from, making the transition significantly smoother.

### 3\. Mobile Baggage vs. Desktop Reality

Jetpack Navigation carries a lot of architectural baggage designed to solve Android-specific problems:

*   Saving and restoring state during process death.
    
*   Handling complex OS-level deep linking URIs.
    
*   Activity and Fragment lifecycle bridging.
    

As a desktop application running in a JVM window, your app doesn't face Android process death. If the user closes the app, it closes. Voyager’s `ScreenModel` provides all the standard state-survival you need for UI navigation (like keeping state alive while navigating between tabs) without forcing you to interact with Android-centric lifecycles.

### Summary

If you were building an Android/iOS app where deep-linking from web URLs was critical, Jetpack Navigation would be the right choice. But since you are building a Desktop utility app focused on rapid UI development and live state management, Voyager will save you hundreds of lines of boilerplate while feeling much closer to the React/Zustand mental model you already know.

If you want a visual breakdown of how Voyager's stack-based approach feels in practice compared to Jetpack Navigation, check out [Meet Voyager: A Kotlin Compose Multiplatform Navigation Solution](https://www.youtube.com/watch?v=Aww-h7ygo2k). This video gives a great walkthrough of how seamless it is to pass arguments and nest layouts in a KMP environment.

## Prompt:
You said

can you integrate these changes into the md

## Response:
Here is the fully updated Markdown document with Jetpack DataStore, Voyager, TarsosDSP, Korge/Filament, and Conveyor seamlessly integrated into the migration plan.

You can copy and paste this directly to replace your original `claude-kmp.md` file.

# Goldbus Light Controller — Kotlin Multiplatform Desktop Migration Plan

## Executive summary

This document describes a full reimplementation of the Goldbus Light Controller as a **Kotlin Multiplatform (KMP) desktop application** targeting macOS, Linux (including Raspberry Pi arm64), and Windows. The existing Go/Wails/React stack is replaced with Kotlin on the backend and Compose Multiplatform on the frontend. The entire feature set is preserved: WLED device control, DMX fixture management, Art-Net output, USB-DMX serial output, audio-reactive Party mode, and network/access-point configuration.

The migration keeps the same architectural shape — a central controller, a service layer, a reactive UI — but maps each Go/React concept to an idiomatic, modern KMP equivalent.

## Technology choices

| Concern | Current (Go/Wails) | KMP replacement |
| --- | --- | --- |
| Desktop shell | Wails v3 (Chromium webview) | **Compose Multiplatform** (Skiko/Skia canvas) |
| UI framework | React 18 + shadcn/ui + Tailwind | **Compose Multiplatform** UI components |
| UI Navigation | React Router / Zustand state | **Voyager** (stack-based KMP routing) |
| 3D fixture preview | Three.js / react-three-fiber | **Korge** (KMP 2D/3D engine) or **Google Filament** |
| State management | Zustand store + snapshot poll | **StateFlow / SharedFlow** inside a `ControllerRepository` |
| HTTP client (WLED) | Go `net/http` goroutine pool | **Ktor client** (coroutine-based) |
| mDNS discovery | grandcat/zeroconf + hashicorp/mdns | **JmDNS** (JVM, cross-platform) |
| UDP (Art-Net) | Go `net.PacketConn` | **Java NIO `DatagramChannel`** via `kotlinx-io` or raw JVM |
| USB serial (DMX) | go.bug.st/serial + CGO | **jSerialComm** (pure JVM, no native build step) |
| Audio & FFT (Party) | gen2brain/malgo (CGO) + manual FFT | **TarsosDSP** (Pure JVM audio capture, DSP, and FFT) |
| Network/AP control | nmcli / networksetup / netsh via `os/exec` | Same shell invocations via `ProcessBuilder` + `expect`\-style wrappers |
| Persistence | JSON files in `UserConfigDir` | **Jetpack DataStore** (transactional, coroutine-native storage) |
| Logging | Go `log` + file tee | **SLF4J + Logback** tee to file |
| Build / Dist | Taskfile + wails3 CLI | **Gradle** + **Conveyor** (cross-platform bundling without CGO/native runners) |

**Why Compose Multiplatform and not Electron/Tauri/Flutter?**

*   Same language as the backend — no IPC bridge, no serialisation layer, no generated bindings.
    
*   Skia-rendered — pixel-identical on all three platforms.
    
*   True desktop widgets (menus, window decorations, file dialogs) without a browser host.
    
*   jSerialComm and TarsosDSP remove the only CGO dependencies in the Go build.
    

## Project structure

```
goldbuslight-kmp/
├── build.gradle.kts
├── settings.gradle.kts
├── conveyor.conf                   # Conveyor packaging configuration
├── gradle/
│   └── libs.versions.toml          # version catalog
├── composeApp/
│   ├── src/
│   │   ├── commonMain/kotlin/
│   │   │   ├── controller/         # WLEDController, DMX*, Party* — pure KMP
│   │   │   ├── discovery/          # JmDNS wrapper
│   │   │   ├── dmx/                # ArtNetPacket, DMXLiveOutput
│   │   │   ├── audio/              # TarsosDSP wrappers
│   │   │   ├── console/            # ConsoleBus ring buffer
│   │   │   ├── network/            # NetworkBackend interface
│   │   │   ├── serial/             # USBSerialDevice interface
│   │   │   ├── persistence/        # Jetpack DataStore repositories
│   │   │   ├── logging/            # Logging init
│   │   │   └── ui/                 # All Compose screens, Voyager components
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

## Phase 1 — Project skeleton and toolchain (week 1)

### 1.1 Gradle setup

`settings.gradle.kts`:

Kotlin

```
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

Ini, TOML

```
[versions]
kotlin = "2.1.0"
compose = "1.7.3"
ktor = "3.1.0"
kotlinx-serialization = "1.8.0"
kotlinx-coroutines = "1.10.1"
datastore = "1.1.1"
voyager = "1.1.0-beta02"
jmdns = "3.5.9"
jserialcomm = "2.11.0"
tarsosdsp = "2.4"
slf4j = "2.0.16"
logback = "1.5.16"

[libraries]
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-cio  = { module = "io.ktor:ktor-client-cio",  version.ref = "ktor" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
kotlinx-coroutines-swing = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-swing", version.ref = "kotlinx-coroutines" }
androidx-datastore-core = { module = "androidx.datastore:datastore-core-okio", version.ref = "datastore" }
voyager-navigator = { module = "cafe.adriel.voyager:voyager-navigator", version.ref = "voyager" }
voyager-screenmodel = { module = "cafe.adriel.voyager:voyager-screenmodel", version.ref = "voyager" }
jmdns = { module = "org.jmdns:jmdns", version.ref = "jmdns" }
jserialcomm = { module = "com.fazecast:jSerialComm", version.ref = "jserialcomm" }
tarsosdsp = { module = "be.tarsos.dsp:core", version.ref = "tarsosdsp" }
slf4j-api = { module = "org.slf4j:slf4j-api", version.ref = "slf4j" }
logback-classic = { module = "ch.qos.logback:logback-classic", version.ref = "logback" }
```

### 1.2 Compose desktop window

`desktopMain/Main.kt`:

Kotlin

```
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

## Phase 2 — Core domain models (week 1–2)

Translate all Go structs to `@Serializable` Kotlin data classes. These live in `commonMain/controller/`.

Kotlin

```
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
```

All `JsonElement` fields replace Go's `map[string]any` and support arbitrary WLED JSON payloads.

**Deliverable**: all domain types compile; `kotlinx.serialization` round-trip tests pass.

## Phase 3 — Persistence layer (week 2)

Replaces manual file I/O with **Jetpack DataStore**, offering transactional, async, and thread-safe persistence out of the box natively mapped to Coroutine `Flows`.

Kotlin

```
// persistence/StateSerializer.kt
object PersistentStateSerializer : Serializer<PersistentState> {
    override val defaultValue = PersistentState()
    override suspend fun readFrom(source: BufferedSource): PersistentState {
        return try {
            Json.decodeFromString(PersistentState.serializer(), source.readUtf8())
        } catch (e: SerializationException) {
            defaultValue
        }
    }
    override suspend fun writeTo(t: PersistentState, sink: BufferedSink) {
        sink.writeUtf8(Json.encodeToString(PersistentState.serializer(), t))
    }
}

// persistence/StatePersistence.kt
class StatePersistenceManager {
    private val path = platformConfigDir() / "wled-controller" / "state.json"
    
    val dataStore: DataStore<PersistentState> = DataStoreFactory.create(
        storage = OkioStorage(FileSystem.SYSTEM, PersistentStateSerializer) { path.toOkioPath() }
    )

    val stateFlow: Flow<PersistentState> = dataStore.data

    suspend fun updateState(transform: suspend (PersistentState) -> PersistentState) {
        dataStore.updateData(transform)
    }
}

fun platformConfigDir(): Path = when {
    System.getProperty("os.name").startsWith("Windows") ->
        Path(System.getenv("APPDATA") ?: System.getProperty("user.home"))
    System.getProperty("os.name").startsWith("Mac") ->
        Path(System.getProperty("user.home")) / "Library" / "Application Support"
    else ->
        Path(System.getenv("XDG_CONFIG_HOME") ?: (System.getProperty("user.home") + "/.config"))
}
```

**Deliverable**: app loads and saves settings/DMX state natively without race conditions.

## Phase 4 — WLED HTTP engine (week 2–3)

Replaces `internal/wled/engine.go`. Uses Ktor coroutine client instead of goroutine dispatcher + worker pool.

Kotlin

```
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
    fun stop() { scope.cancel(); client.close() }
}
```

**Deliverable**: can send a brightness/colour command to a real WLED device.

## Phase 5 — mDNS discovery (week 3)

Replaces `internal/discovery/discovery.go`. JmDNS is a mature JVM mDNS library.

Kotlin

```
// discovery/Discovery.kt
class DiscoveryRunner(private val settings: DiscoverySettings) {
    suspend fun discoverOnce(timeoutMs: Long): List<DiscoveredDevice> = withTimeout(timeoutMs) {
        val jmdns = JmDNS.create()
        val results = mutableListOf<DiscoveredDevice>()
        try {
            for (type in settings.serviceTypes) {   // e.g. "_wled._tcp.local."
                // ... setup ServiceListener and track results ...
                delay(timeoutMs)
            }
        } finally {
            jmdns.close()
        }
        results
    }
}
```

**Deliverable**: `DiscoverNow()` returns real WLED devices on the LAN.

## Phase 6 & 7 — Art-Net & USB Serial DMX (week 3–4)

Replaces `internal/serial/` + CGO. **jSerialComm** handles native serial communication purely on the JVM without external build steps. UDP output remains standard Java NIO.

Kotlin

```
// serial/USBSerial.kt  (desktopMain)
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
        // DMX512 framing matching Go implementation
        port.setBreakSignal(true)
        Thread.sleep(0, 88_000)   // 88µs break
        port.setBreakSignal(false)
        Thread.sleep(0, 8_000)    // 8µs MAB
        port.writeBytes(byteArrayOf(0x00) + universe, 513L)
    }
    override fun close() = port.closePort().let { Unit }
}
```

**Deliverable**: Live DMX output drives a real fixture over USB.

## Phase 8 — Audio capture and Party mode (week 4)

Replaces `internal/audio/capture.go` (CGO) and custom FFT math with **TarsosDSP**. This abstracts away difficult windowing and signal processing natively on the JVM.

Kotlin

```
// audio/PartyAudioEngine.kt
class PartyAudioEngine(
    private val onFeaturesExtracted: (PartyFeatures) -> Unit
) {
    private var dispatcher: AudioDispatcher? = null
    private var thread: Thread? = null

    fun start(mixerIndex: Int) {
        val format = AudioFormat(44100f, 16, 1, true, false)
        val mixer = AudioSystem.getMixer(AudioSystem.getMixerInfo()[mixerIndex])
        
        dispatcher = AudioDispatcherFactory.fromTargetDataLine(mixer.targetLineInfo[0] as DataLine.Info, 1024, 512)
        
        // Let TarsosDSP handle the FFT and processing natively
        dispatcher?.addAudioProcessor(object : AudioProcessor {
            val fft = FFT(1024)
            override fun process(audioEvent: AudioEvent): Boolean {
                val audioFloatBuffer = audioEvent.floatBuffer
                fft.forwardTransform(audioFloatBuffer)
                
                // Extract Bass, Mid, Treble magnitudes from fft.modulus()
                val features = extractBands(fft.modulus(), audioEvent.rms)
                onFeaturesExtracted(features)
                return true
            }
            override fun processingFinished() {}
        })

        thread = Thread(dispatcher, "Audio-Dispatcher").apply { start() }
    }

    fun stop() { dispatcher?.stop() }
}
```

The profile logic in `dmx_party_profiles.go` remains a straightforward `when` expression mapping features to DMX channel outputs.

**Deliverable**: Party mode animates physical DMX fixtures with audio-reactive patterns without CGO.

## Phase 9 — WLEDController (week 4–5)

The central controller in `controller/WLEDController.kt` replaces the 1500-line `internal/controller/controller.go`. It owns all subsystems and manages state flows.

Kotlin

```
class WLEDController {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val persistence = StatePersistenceManager()
    
    val snapshot: StateFlow<ControllerSnapshot> = persistence.stateFlow
        .map { /* map to full snapshot */ }
        .stateIn(scope, SharingStarted.Eagerly, ControllerSnapshot.empty())

    fun start() { /* start loops */ }
    fun stop()  { scope.cancel() }
}
```

## Phase 10 & 11 — Network Backend & ConsoleBus (week 5)

Process builder shell commands for Linux/Windows/Mac remain identical. ConsoleBus transitions from a `sync.Mutex` ring buffer to a standard JVM `ReentrantLock` buffer.

## Phase 12 — Compose UI & Navigation (weeks 5–8)

The React component tree maps to Compose. **Voyager** replaces React Router, allowing complex objects (like active hardware state) to be passed directly to screens.

### Navigation / routing with Voyager

Kotlin

```
// ui/AppShell.kt
@Composable
fun AppShell(controller: WLEDController) {
    Navigator(PresetsScreen(controller)) { navigator ->
        Row {
            SideNav(navigator, controller)
            Box(modifier = Modifier.weight(1f)) {
                CurrentScreen() // Voyager handles the stack automatically
            }
        }
    }
}

// Screens are strongly typed classes, passing data natively
class DMXFixtureEditorScreen(
    private val fixtureId: String?, 
    private val controller: WLEDController
) : Screen {
    @Composable
    override fun Content() {
        val snapshot by controller.snapshot.collectAsState()
        val fixture = snapshot.fixtures.find { it.id == fixtureId }
        // Render UI...
    }
}
```

### 3D fixture preview

Replace Three.js with **Korge** (Kotlin-native 2D/3D engine) or **Google Filament** for lightweight 3D OpenGL rendering inside a Compose `SwingPanel`. This avoids writing raw LWJGL matrices from scratch. Alternatively, default to Compose 2D canvas for Raspberry Pi compatibility.

## Phase 13 & 14 — Logging & Simulation (week 5-6)

Logback tees to standard JVM configurations. Simulation flags inject mock `WLEDDevice` or mock `USBSerialDevice` instances seamlessly.

## Phase 15 — Distribution with Conveyor (week 7)

Replace complex `jpackage` fat-jars and native build matrices with **Conveyor**. Conveyor can generate Windows MSIs, macOS DMG/App bundles, and Linux Debs/RPMs *from a single Linux CI runner*, bypassing the need for an expensive OS build matrix.

`conveyor.conf`:

Code snippet

```
include required("/stdlib/jdk/21/openjdk.conf")

app {
  display-name = "Goldbus Licht Controller"
  fsname = "goldbus-light"
  version = "1.0.0"
  
  inputs += build/libs/composeApp-all.jar
  
  linux.amd64.inputs += dependencies/linux-amd64
  linux.aarch64.inputs += dependencies/linux-aarch64 # Raspberry Pi natively supported
  
  mac.info-plist {
    NSMicrophoneUsageDescription = "Required for Audio Reactive Party Mode."
  }
}
```

Run `conveyor make site` locally or in CI, and it packages cross-platform binaries instantly.

## Phased delivery summary

| Week | Deliverable |
| --- | --- |
| 1 | Gradle project, Conveyor config, Compose window opens |
| 1–2 | All domain models compile; DataStore persistence round-trips |
| 2–3 | WLED HTTP engine sends commands to real devices |
| 3 | mDNS discovery finds devices; Art-Net packets verified with Wireshark |
| 3–4 | USB-DMX output drives real fixture; device listing works on all 3 OSes |
| 4 | TarsosDSP Audio capture, FFT, Party mode loop animates fixtures |
| 4–5 | Full WLEDController: DataStore state emission, all service methods |
| 5 | Network/AP backend; ConsoleBus; logging |
| 5–8 | Full Compose UI mapped via Voyager routing |
| 7 | Conveyor builds `.deb` for Raspberry Pi arm64 alongside Mac/Win bundles |
| 8 | Polish, simulation mode tests, parity check against Go app |


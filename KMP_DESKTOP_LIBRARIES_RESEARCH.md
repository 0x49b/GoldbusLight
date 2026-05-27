# Kotlin Multiplatform (KMP) Desktop Libraries Research — May 2026

## Platform Versions Summary

| Component | Version | Released |
|-----------|---------|----------|
| **Kotlin** | 2.3.21 | April 23, 2026 |
| **Compose Multiplatform** | 1.11.0 | May 13, 2026 |
| **Compose Multiplatform (alpha)** | 1.12.0-alpha02 | May 19, 2026 |

### Kotlin & Compose Compatibility Notes

- Compose Multiplatform 1.11.0 requires **Kotlin 2.2.0+** (migrated to Kotlin language/API version 2.2)
- For **Desktop (JVM) only** targets: Kotlin 2.2.0+ is sufficient
- For **Native and Web** targets: Kotlin 2.3.0+ is required
- For **Kotlin/JS or Kotlin/Wasm**: Kotlin 2.3.20+ is required
- Recommended: Use **Kotlin 2.3.21** for maximum compatibility across all targets

---

## 1. Compose Multiplatform (Desktop with Material 3)

**Plugin:** `org.jetbrains.compose` version `1.11.0`  
**Kotlin Plugin:** `org.jetbrains.kotlin.plugin.compose` (same version as Kotlin)

### Maven Coordinates

| Library | Coordinates |
|---------|-------------|
| Runtime | `org.jetbrains.compose.runtime:runtime:1.11.0` |
| UI | `org.jetbrains.compose.ui:ui:1.11.0` |
| Foundation | `org.jetbrains.compose.foundation:foundation:1.11.0` |
| Material 3 | `org.jetbrains.compose.material3:material3:1.11.0-alpha07` |
| Material 3 Adaptive | `org.jetbrains.compose.material3.adaptive:adaptive:1.3.0-alpha07` |
| Desktop Current OS | `org.jetbrains.compose.desktop:desktop-currentOs` (via plugin accessor) |
| Lifecycle | `org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0-beta01` |
| Navigation | `org.jetbrains.androidx.navigation:navigation-compose:2.9.2` |

### Gradle Setup (`build.gradle.kts`)

```kotlin
import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm") version "2.3.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.21"
    id("org.jetbrains.compose") version "1.11.0"
}

repositories {
    mavenCentral()
    maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    google()
}

dependencies {
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)
}

compose.desktop {
    application {
        mainClass = "MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "GoldbusLightController"
            packageVersion = "1.0.0"
        }
    }
}
```

### Basic Usage (Material 3 Desktop App)

```kotlin
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "Goldbus Light Controller"
    ) {
        MaterialTheme(colorScheme = darkColorScheme()) {
            Surface {
                App()
            }
        }
    }
}

@Composable
fun App() {
    var selectedTab by remember { mutableStateOf(0) }
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Goldbus Light Controller") })
        }
    ) { padding ->
        // App content
    }
}
```

---

## 2. HTTP Client — Ktor

**Latest Version:** 3.5.0 (May 15, 2026)

### Maven Coordinates

| Library | Coordinates |
|---------|-------------|
| Core | `io.ktor:ktor-client-core:3.5.0` |
| CIO Engine (pure Kotlin) | `io.ktor:ktor-client-cio:3.5.0` |
| OkHttp Engine (JVM) | `io.ktor:ktor-client-okhttp:3.5.0` |
| Content Negotiation | `io.ktor:ktor-client-content-negotiation:3.5.0` |
| JSON Serialization | `io.ktor:ktor-serialization-kotlinx-json:3.5.0` |

### Gradle Dependency

```kotlin
dependencies {
    implementation("io.ktor:ktor-client-core:3.5.0")
    implementation("io.ktor:ktor-client-cio:3.5.0")  // or ktor-client-okhttp
    implementation("io.ktor:ktor-client-content-negotiation:3.5.0")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.5.0")
}
```

### Basic Usage (Sending commands to WLED devices)

```kotlin
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

val client = HttpClient(CIO) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        })
    }
    engine {
        requestTimeout = 5000
    }
}

suspend fun sendWledCommand(deviceIp: String, command: Map<String, Any>) {
    val response = client.post("http://$deviceIp/json/state") {
        contentType(ContentType.Application.Json)
        setBody(command)
    }
    println("Response: ${response.status}")
}

suspend fun getWledState(deviceIp: String): String {
    return client.get("http://$deviceIp/json/state").bodyAsText()
}
```

---

## 3. mDNS/Zeroconf Discovery

### Option A: dns-sd-kt (Kotlin Multiplatform — Recommended)

**Latest Version:** 1.1.0 (March 28, 2026)  
**Maven Coordinates:** `com.appstractive:dns-sd-kt:1.1.0`  
**Platforms:** Android (NSD), iOS (Bonjour), JVM (JmDNS internally)  
**License:** Apache 2.0

```kotlin
dependencies {
    implementation("com.appstractive:dns-sd-kt:1.1.0")
}
```

### Option B: JmDNS (Pure Java — JVM only)

**Latest Version:** 3.6.3 (December 2025)  
**Maven Coordinates:** `org.jmdns:jmdns:3.6.3`  
**License:** Apache 2.0

```kotlin
dependencies {
    implementation("org.jmdns:jmdns:3.6.3")
}
```

### Basic Usage (JmDNS — discovering WLED devices)

```kotlin
import javax.jmdns.JmDNS
import javax.jmdns.ServiceEvent
import javax.jmdns.ServiceListener
import java.net.InetAddress

class WledDiscovery {
    private var jmdns: JmDNS? = null

    fun startDiscovery(onDeviceFound: (name: String, host: String, port: Int) -> Unit) {
        jmdns = JmDNS.create(InetAddress.getLocalHost()).apply {
            addServiceListener("_wled._tcp.local.", object : ServiceListener {
                override fun serviceAdded(event: ServiceEvent) {
                    requestServiceInfo(event.type, event.name)
                }

                override fun serviceResolved(event: ServiceEvent) {
                    val info = event.info
                    onDeviceFound(
                        info.name,
                        info.hostAddresses.firstOrNull() ?: "",
                        info.port
                    )
                }

                override fun serviceRemoved(event: ServiceEvent) {}
            })
        }
    }

    fun stopDiscovery() {
        jmdns?.close()
        jmdns = null
    }
}
```

### Option C: wac-discovery (KMP with Flow-based API)

**Coordinates:** Published to Maven Central (check for latest)  
**Platforms:** Android, iOS, JVM (uses JmDNS on JVM)

---

## 4. Serial Port Communication (DMX over USB Serial)

### jSerialComm

**Latest Version:** 2.11.4 (November 2025)  
**Maven Coordinates:** `com.fazecast:jSerialComm:2.11.4`  
**License:** LGPL-3.0  
**Platforms:** Windows, macOS, Linux, ARM (Raspberry Pi)

```kotlin
dependencies {
    implementation("com.fazecast:jSerialComm:2.11.4")
}
```

**Note:** For Java 24+, add JVM argument: `--enable-native-access=com.fazecast.jSerialComm`

### Basic Usage (DMX over serial)

```kotlin
import com.fazecast.jSerialComm.SerialPort

class DmxSerialController {
    private var port: SerialPort? = null

    fun listPorts(): List<String> {
        return SerialPort.getCommPorts().map { it.systemPortName }
    }

    fun connect(portName: String, baudRate: Int = 250000): Boolean {
        port = SerialPort.getCommPorts().find { it.systemPortName == portName }?.apply {
            this.baudRate = baudRate
            setNumDataBits(8)
            setNumStopBits(SerialPort.TWO_STOP_BITS)
            setParity(SerialPort.NO_PARITY)
        }
        return port?.openPort() ?: false
    }

    fun sendDmxFrame(data: ByteArray) {
        port?.let { p ->
            // Send break (set baud to lower rate momentarily for ENTTEC-style)
            p.setBreak()
            Thread.sleep(1) // ~100µs break
            p.clearBreak()
            Thread.sleep(0, 12000) // MAB (Mark After Break)

            // Send start code + DMX data
            val frame = ByteArray(data.size + 1)
            frame[0] = 0x00 // Start code
            System.arraycopy(data, 0, frame, 1, data.size)
            p.writeBytes(frame, frame.size)
        }
    }

    fun disconnect() {
        port?.closePort()
        port = null
    }
}
```

---

## 5. UDP Networking (Art-Net Protocol)

### Option A: Java Standard Library (DatagramSocket)

No additional dependency needed — uses `java.net.DatagramSocket`.

### Option B: artnet4j (Java Art-Net library)

**Latest Version:** 0.6.2  
**Maven Coordinates:** `ch.bildspur:artnet4j:0.6.2`  
**License:** GPL-3.0

```kotlin
dependencies {
    implementation("ch.bildspur:artnet4j:0.6.2")
}
```

### Option C: LibArtNet

**Maven Coordinates:** `de.deltaeight:LibArtNet:1.1.2-beta`  
**License:** MIT

### Basic Usage (Raw UDP Art-Net packet)

```kotlin
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class ArtNetSender(private val targetIp: String = "255.255.255.255") {
    private val socket = DatagramSocket()
    private val port = 6454
    private var sequence: Byte = 0

    fun sendDmx(universe: Int, dmxData: ByteArray) {
        val header = buildArtDmxPacket(universe, dmxData)
        val address = InetAddress.getByName(targetIp)
        val packet = DatagramPacket(header, header.size, address, port)
        socket.send(packet)
        sequence = ((sequence + 1) % 256).toByte()
    }

    private fun buildArtDmxPacket(universe: Int, dmxData: ByteArray): ByteArray {
        val dataLength = dmxData.size.coerceIn(2, 512)
        val packet = ByteArray(18 + dataLength)

        // Art-Net header "Art-Net\0"
        "Art-Net".toByteArray().copyInto(packet, 0)
        packet[7] = 0x00

        // OpCode: OpDmx (0x5000) - little-endian
        packet[8] = 0x00
        packet[9] = 0x50

        // Protocol version (14) - big-endian
        packet[10] = 0x00
        packet[11] = 14

        // Sequence
        packet[12] = sequence

        // Physical port
        packet[13] = 0x00

        // Universe - little-endian
        packet[14] = (universe and 0xFF).toByte()
        packet[15] = ((universe shr 8) and 0xFF).toByte()

        // Data length - big-endian
        packet[16] = ((dataLength shr 8) and 0xFF).toByte()
        packet[17] = (dataLength and 0xFF).toByte()

        // DMX data
        dmxData.copyInto(packet, 18, 0, dataLength)

        return packet
    }

    fun close() {
        socket.close()
    }
}
```

### Usage with artnet4j

```kotlin
import ch.bildspur.artnet.ArtNetClient

val artnet = ArtNetClient()
artnet.start()

val dmxData = ByteArray(512)
dmxData[0] = 255.toByte() // Channel 1 full
dmxData[1] = 128.toByte() // Channel 2 half

// Unicast to specific node
artnet.unicastDmx("192.168.1.100", 0, 0, dmxData)

// Or broadcast
artnet.broadcastDmx(0, 0, dmxData)

artnet.stop()
```

---

## 6. JSON Serialization — kotlinx.serialization

**Latest Version:** 1.11.0 (April 9, 2026)  
**Based on:** Kotlin 2.3.20

### Maven Coordinates

| Library | Coordinates |
|---------|-------------|
| Core | `org.jetbrains.kotlinx:kotlinx-serialization-core:1.11.0` |
| JSON | `org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0` |

### Gradle Setup

```kotlin
plugins {
    kotlin("jvm") version "2.3.21"
    kotlin("plugin.serialization") version "2.3.21"
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}
```

### Basic Usage

```kotlin
import kotlinx.serialization.*
import kotlinx.serialization.json.*

@Serializable
data class WledState(
    val on: Boolean,
    val bri: Int,
    val seg: List<Segment> = emptyList()
)

@Serializable
data class Segment(
    val id: Int,
    val start: Int,
    val stop: Int,
    val col: List<List<Int>> = emptyList()
)

val json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    prettyPrint = true
}

// Serialize
val state = WledState(on = true, bri = 255)
val jsonString = json.encodeToString(state)

// Deserialize
val parsed = json.decodeFromString<WledState>(jsonString)
```

---

## 7. Coroutines — kotlinx.coroutines

**Latest Version:** 1.11.0 (May 8, 2026)  
**Companion to:** Kotlin 2.2.20+

### Maven Coordinates

| Library | Coordinates |
|---------|-------------|
| Core | `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0` |
| Swing (for Desktop) | `org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.11.0` |

### Gradle Dependency

```kotlin
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.11.0")
}
```

### Basic Usage

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.swing.Swing

class WledController {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _devices = MutableStateFlow<List<WledDevice>>(emptyList())
    val devices: StateFlow<List<WledDevice>> = _devices.asStateFlow()

    fun startDiscovery() {
        scope.launch {
            // Background discovery
            discoverDevices().collect { device ->
                _devices.update { it + device }
            }
        }
    }

    fun sendCommand(device: WledDevice, command: WledCommand) {
        scope.launch(Dispatchers.IO) {
            // Network call on IO dispatcher
            httpClient.sendCommand(device.ip, command)
        }
    }

    // Periodic snapshot emission (like the Go controller)
    fun startSnapshotEmission(interval: Long = 1000L) {
        scope.launch {
            while (isActive) {
                delay(interval)
                withContext(Dispatchers.Swing) {
                    // Update UI on Swing/AWT thread
                    emitSnapshot()
                }
            }
        }
    }

    fun dispose() {
        scope.cancel()
    }
}
```

---

## 8. Audio Processing (FFT / Microphone Input)

### TarsosDSP

**Latest Version:** 2.5  
**Maven Coordinates:** `be.tarsos.dsp:core:2.5` + `be.tarsos.dsp:jvm:2.5`  
**License:** GPL-3.0  
**Repository:** Custom (not on Maven Central)

### Gradle Setup

```kotlin
repositories {
    mavenCentral()
    maven {
        name = "TarsosDSP repository"
        url = uri("https://mvn.0110.be/releases")
    }
}

dependencies {
    implementation("be.tarsos.dsp:core:2.5")
    implementation("be.tarsos.dsp:jvm:2.5")
}
```

### Basic Usage (Audio-reactive with FFT)

```kotlin
import be.tarsos.dsp.AudioDispatcher
import be.tarsos.dsp.AudioEvent
import be.tarsos.dsp.AudioProcessor
import be.tarsos.dsp.io.jvm.AudioDispatcherFactory
import be.tarsos.dsp.util.fft.FFT

class AudioReactiveProcessor(
    private val sampleRate: Int = 44100,
    private val bufferSize: Int = 2048,
    private val onFFTResult: (FloatArray) -> Unit
) {
    private var dispatcher: AudioDispatcher? = null
    private var thread: Thread? = null

    fun start() {
        dispatcher = AudioDispatcherFactory.fromDefaultMicrophone(sampleRate, bufferSize, 0).apply {
            addAudioProcessor(object : AudioProcessor {
                private val fft = FFT(bufferSize)
                private val amplitudes = FloatArray(bufferSize / 2)

                override fun process(audioEvent: AudioEvent): Boolean {
                    val buffer = audioEvent.floatBuffer.clone()
                    fft.forwardTransform(buffer)
                    fft.modulus(buffer, amplitudes)
                    onFFTResult(amplitudes)
                    return true
                }

                override fun processingFinished() {}
            })
        }
        thread = Thread(dispatcher).apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        dispatcher?.stop()
        thread?.interrupt()
    }
}
```

### Alternative: Java Sound API (no external dependency)

For simpler audio capture without FFT library dependency, use `javax.sound.sampled`:

```kotlin
import javax.sound.sampled.*

class SimpleAudioCapture {
    private var line: TargetDataLine? = null

    fun startCapture(onSamples: (FloatArray) -> Unit) {
        val format = AudioFormat(44100f, 16, 1, true, false)
        val info = DataLine.Info(TargetDataLine::class.java, format)
        line = (AudioSystem.getLine(info) as TargetDataLine).apply {
            open(format, 4096)
            start()
        }

        Thread {
            val buffer = ByteArray(2048)
            while (line?.isOpen == true) {
                val bytesRead = line!!.read(buffer, 0, buffer.size)
                if (bytesRead > 0) {
                    val samples = FloatArray(bytesRead / 2) { i ->
                        val sample = (buffer[i * 2].toInt() and 0xFF) or
                                     (buffer[i * 2 + 1].toInt() shl 8)
                        sample.toShort().toFloat() / Short.MAX_VALUE
                    }
                    onSamples(samples)
                }
            }
        }.apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        line?.stop()
        line?.close()
    }
}
```

---

## 9. State Management (Compose Desktop)

### Recommended Pattern: ViewModel + StateFlow + Unidirectional Data Flow

No extra library needed for Desktop — use kotlinx.coroutines `StateFlow` with Compose's `collectAsState()`.

### Basic Pattern

```kotlin
import androidx.compose.runtime.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

// State data class — single source of truth
data class ControllerState(
    val devices: List<WledDevice> = emptyList(),
    val selectedDevice: WledDevice? = null,
    val isDiscovering: Boolean = false,
    val dmxUniverse: ByteArray = ByteArray(512),
    val error: String? = null
)

// ViewModel (plain class for Desktop — no Android ViewModel dependency needed)
class ControllerViewModel(
    private val discovery: WledDiscovery,
    private val httpClient: WledHttpClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _state = MutableStateFlow(ControllerState())
    val state: StateFlow<ControllerState> = _state.asStateFlow()

    fun onAction(action: UiAction) {
        when (action) {
            is UiAction.StartDiscovery -> startDiscovery()
            is UiAction.SelectDevice -> selectDevice(action.device)
            is UiAction.SetBrightness -> setBrightness(action.device, action.value)
        }
    }

    private fun startDiscovery() {
        _state.update { it.copy(isDiscovering = true) }
        scope.launch {
            discovery.discover().collect { device ->
                _state.update { it.copy(devices = it.devices + device) }
            }
            _state.update { it.copy(isDiscovering = false) }
        }
    }

    fun dispose() { scope.cancel() }
}

// Sealed interface for actions
sealed interface UiAction {
    data object StartDiscovery : UiAction
    data class SelectDevice(val device: WledDevice) : UiAction
    data class SetBrightness(val device: WledDevice, val value: Int) : UiAction
}

// Composable collecting state
@Composable
fun ControllerScreen(viewModel: ControllerViewModel) {
    val state by viewModel.state.collectAsState()

    DeviceList(
        devices = state.devices,
        isDiscovering = state.isDiscovering,
        onDeviceSelected = { viewModel.onAction(UiAction.SelectDevice(it)) },
        onStartDiscovery = { viewModel.onAction(UiAction.StartDiscovery) }
    )
}
```

### For lifecycle-aware ViewModels on Desktop:

Use `org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0-beta01` which works on Compose Multiplatform Desktop.

---

## 10. File I/O (Persisting JSON State)

### Option A: kotlinx-io (Multiplatform)

**Latest Version:** 0.9.0 (February 20, 2026)  
**Maven Coordinates:** `org.jetbrains.kotlinx:kotlinx-io-core:0.9.0`  
**Note:** FileSystem API is experimental

```kotlin
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-io-core:0.9.0")
}
```

### Option B: Java Standard Library (for JVM-only Desktop)

No additional dependency needed — use `java.nio.file` or `java.io.File`.

### Basic Usage (Persisting state as JSON)

```kotlin
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class StateManager(private val configDir: Path) {
    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
    }

    init {
        Files.createDirectories(configDir)
    }

    companion object {
        fun getDefaultConfigDir(): Path {
            val home = System.getProperty("user.home")
            val os = System.getProperty("os.name").lowercase()
            return when {
                os.contains("win") -> Paths.get(System.getenv("APPDATA"), "goldbus-controller")
                os.contains("mac") -> Paths.get(home, "Library", "Application Support", "goldbus-controller")
                else -> Paths.get(home, ".config", "goldbus-controller")
            }
        }
    }

    inline fun <reified T> save(filename: String, data: T) {
        val file = configDir.resolve(filename)
        Files.writeString(file, json.encodeToString(data))
    }

    inline fun <reified T> load(filename: String): T? {
        val file = configDir.resolve(filename)
        if (!Files.exists(file)) return null
        return try {
            json.decodeFromString<T>(Files.readString(file))
        } catch (e: Exception) {
            null
        }
    }
}

// Usage
val stateManager = StateManager(StateManager.getDefaultConfigDir())
stateManager.save("state.json", controllerState)
val loaded = stateManager.load<ControllerState>("state.json")
```

### Using kotlinx-io (Multiplatform approach)

```kotlin
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.buffered
import kotlinx.io.readString
import kotlinx.io.writeString

fun saveState(path: Path, content: String) {
    SystemFileSystem.sink(path).buffered().use { sink ->
        sink.writeString(content)
    }
}

fun loadState(path: Path): String? {
    if (!SystemFileSystem.exists(path)) return null
    return SystemFileSystem.source(path).buffered().use { source ->
        source.readString()
    }
}
```

---

## Complete Gradle Project Setup

### `gradle/libs.versions.toml` (Version Catalog)

```toml
[versions]
kotlin = "2.3.21"
compose = "1.11.0"
ktor = "3.5.0"
coroutines = "1.11.0"
serialization = "1.11.0"
kotlinxIo = "0.9.0"
jmdns = "3.6.3"
jserialcomm = "2.11.4"
artnet4j = "0.6.2"
tarsosdsp = "2.5"
dnsSdKt = "1.1.0"

[libraries]
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-cio = { module = "io.ktor:ktor-client-cio", version.ref = "ktor" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-swing = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-swing", version.ref = "coroutines" }
serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-io-core = { module = "org.jetbrains.kotlinx:kotlinx-io-core", version.ref = "kotlinxIo" }
jmdns = { module = "org.jmdns:jmdns", version.ref = "jmdns" }
jserialcomm = { module = "com.fazecast:jSerialComm", version.ref = "jserialcomm" }
artnet4j = { module = "ch.bildspur:artnet4j", version.ref = "artnet4j" }
tarsosdsp-core = { module = "be.tarsos.dsp:core", version.ref = "tarsosdsp" }
tarsosdsp-jvm = { module = "be.tarsos.dsp:jvm", version.ref = "tarsosdsp" }
dns-sd-kt = { module = "com.appstractive:dns-sd-kt", version.ref = "dnsSdKt" }

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
compose = { id = "org.jetbrains.compose", version.ref = "compose" }
```

### `settings.gradle.kts`

```kotlin
pluginManagement {
    repositories {
        gradlePluginPortal()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
        google()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
        google()
        maven {
            name = "TarsosDSP repository"
            url = uri("https://mvn.0110.be/releases")
        }
    }
}

rootProject.name = "goldbus-light-controller"
```

### `build.gradle.kts`

```kotlin
import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose)
}

dependencies {
    // Compose Desktop
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)

    // Networking
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)

    // Coroutines
    implementation(libs.coroutines.core)
    implementation(libs.coroutines.swing)

    // Serialization
    implementation(libs.serialization.json)

    // File I/O
    implementation(libs.kotlinx.io.core)

    // mDNS Discovery
    implementation(libs.jmdns)
    // OR for KMP: implementation(libs.dns.sd.kt)

    // Serial Communication (DMX)
    implementation(libs.jserialcomm)

    // Art-Net (UDP)
    implementation(libs.artnet4j)

    // Audio Processing
    implementation(libs.tarsosdsp.core)
    implementation(libs.tarsosdsp.jvm)
}

compose.desktop {
    application {
        mainClass = "MainKt"

        jvmArgs += listOf(
            "--enable-native-access=com.fazecast.jSerialComm"
        )

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "GoldbusLightController"
            packageVersion = "1.0.0"
            description = "WLED and DMX light controller"

            linux {
                iconFile.set(project.file("icons/icon.png"))
            }
            windows {
                iconFile.set(project.file("icons/icon.ico"))
            }
            macOS {
                iconFile.set(project.file("icons/icon.icns"))
            }
        }
    }
}
```

---

## Library License Summary

| Library | License | Notes |
|---------|---------|-------|
| Compose Multiplatform | Apache 2.0 | Free for commercial use |
| Ktor | Apache 2.0 | Free for commercial use |
| kotlinx.serialization | Apache 2.0 | Free for commercial use |
| kotlinx.coroutines | Apache 2.0 | Free for commercial use |
| kotlinx-io | Apache 2.0 | Free for commercial use |
| JmDNS | Apache 2.0 | Free for commercial use |
| dns-sd-kt | Apache 2.0 | Free for commercial use |
| jSerialComm | LGPL-3.0 | OK for dynamic linking |
| artnet4j | GPL-3.0 | **Copyleft** — consider raw UDP instead |
| LibArtNet | MIT | Free for commercial use |
| TarsosDSP | GPL-3.0 | **Copyleft** — consider Java Sound API alternative |

---

## Key Recommendations

1. **For a commercial/proprietary project**, avoid GPL-licensed libraries (artnet4j, TarsosDSP). Use raw `DatagramSocket` for Art-Net and Java Sound API + custom FFT for audio.

2. **For mDNS**, prefer `dns-sd-kt` (v1.1.0) if you want a clean KMP API, or `JmDNS` directly if you only target Desktop/JVM.

3. **For state management**, the pattern of a plain Kotlin class with `MutableStateFlow` + `collectAsState()` in Compose is the idiomatic Desktop approach. No need for Android ViewModel dependencies unless you want lifecycle-aware scoping.

4. **For UDP/Art-Net**, implementing the protocol directly with `java.net.DatagramSocket` is straightforward (18-byte header + 512 bytes data) and avoids GPL concerns.

5. **Compose Multiplatform 1.11.0** is the latest stable and includes Material 3 (as alpha within the release). The Material 3 coordinate is `org.jetbrains.compose.material3:material3:1.11.0-alpha07`.

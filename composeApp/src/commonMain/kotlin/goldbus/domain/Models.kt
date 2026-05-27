package goldbus.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.time.Clock

const val PersistentStateVersion = 3
const val SimulatedWledDeviceId = "sim:wled"

@OptIn(kotlin.time.ExperimentalTime::class)
fun nowIso(): String = Clock.System.now().toString()

@Serializable
data class AccessPointSettings(
    val enabled: Boolean = true,
    val connection: String = "wled-controller-ap",
    val interfaceName: String = "wlan0",
    val ssid: String = "WLED-Controller-Net",
    val password: String = "wled-control",
    val channel: Int = 6,
)

@Serializable
data class DiscoverySettings(
    val enabled: Boolean = true,
    val serviceTypes: List<String> = listOf("_wled._tcp", "_http._tcp"),
    val intervalSeconds: Int = 15,
    val queryTimeoutMs: Int = 2_000,
    val bindInterface: String = "",
    val passiveBrowse: Boolean = true,
    val subnetProbe: Boolean = false,
    val pollIntervalSecondsWhenApEnabled: Int = 5,
)

@Serializable
data class ProvisioningSettings(
    val autoProvision: Boolean = false,
    val defaultStatePayload: JsonObject = buildJsonObject {
        put("on", true)
        put("bri", 180)
    },
    val defaultConfigPatch: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class TestingSettings(
    val simulateWled: Boolean = false,
)

@Serializable
data class WledSettings(
    val enabled: Boolean = true,
    val discovery: DiscoverySettings = DiscoverySettings(),
    val provisioning: ProvisioningSettings = ProvisioningSettings(),
    val testing: TestingSettings = TestingSettings(),
)

@Serializable
data class ArtNetSettings(
    val enabled: Boolean = false,
    val targetHost: String = "255.255.255.255",
    val port: Int = 6454,
    val net: Int = 0,
    val subnet: Int = 0,
    val universe: Int = 0,
    val refreshHz: Int = 44,
)

@Serializable
data class UsbTransportSettings(
    val enabled: Boolean? = true,
)

@Serializable
data class DmxTestingSettings(
    val simulateUsbDmx: Boolean = false,
    val simulateArtNet: Boolean = false,
)

@Serializable
data class DmxSettings(
    val enabled: Boolean = true,
    val usb: UsbTransportSettings = UsbTransportSettings(),
    val artNet: ArtNetSettings = ArtNetSettings(),
    val testing: DmxTestingSettings = DmxTestingSettings(),
)

@Serializable
data class ControllerSettings(
    val accessPoint: AccessPointSettings = AccessPointSettings(),
    val wled: WledSettings = WledSettings(),
    val dmx: DmxSettings = DmxSettings(),
    val discovery: DiscoverySettings? = null,
    val provisioning: ProvisioningSettings? = null,
    val testing: TestingSettings? = null,
)

@Serializable
data class WledDevice(
    val id: String,
    val name: String,
    val host: String,
    val address: String,
    val port: Int = 80,
    val lastSeen: String = nowIso(),
    val online: Boolean = true,
    val provisioned: Boolean = false,
    val ignored: Boolean = false,
    val info: Map<String, JsonElement> = emptyMap(),
    val lastState: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class GeneralTabState(
    val on: Boolean = true,
    val bri: Int = 200,
    val rgb: List<Int> = listOf(255, 169, 87),
    val fx: Int = 0,
    val pal: Int = 0,
    val sx: Int = 128,
    val ix: Int = 128,
)

@Serializable
data class ControllerCapabilities(
    val networkBackendId: String = "kmp-desktop",
    val networkBackendLabel: String = "Kotlin Desktop",
    val networkControlAvailable: Boolean = false,
    val networkCliName: String = "",
    val networkCliUnavailableReason: String? = "Network/AP control has not been ported yet.",
    val nmcliAvailable: Boolean = false,
)

@Serializable
data class ControllerSnapshot(
    val settings: ControllerSettings = ControllerSettings(),
    val devices: List<WledDevice> = emptyList(),
    val generalTabState: GeneralTabState = GeneralTabState(),
    val persistencePath: String = "",
    val updatedAt: String = nowIso(),
    val capabilities: ControllerCapabilities = ControllerCapabilities(),
    val dmxState: DmxState = DmxState(),
)

@Serializable
data class PersistentState(
    val version: Int = PersistentStateVersion,
    val savedAt: String = nowIso(),
    val settings: ControllerSettings = ControllerSettings(),
    val devices: Map<String, WledDevice> = emptyMap(),
)

@Serializable
enum class DmxFixtureType {
    @SerialName("colorChanger")
    ColorChanger,

    @SerialName("dimmer")
    Dimmer,

    @SerialName("effect")
    Effect,

    @SerialName("fan")
    Fan,

    @SerialName("flower")
    Flower,

    @SerialName("hazer")
    Hazer,

    @SerialName("laser")
    Laser,

    @SerialName("ledBarBeams")
    LedBarBeams,

    @SerialName("ledBarPixels")
    LedBarPixels,

    @SerialName("movingHead")
    MovingHead,

    @SerialName("other")
    Other,

    @SerialName("scanner")
    Scanner,

    @SerialName("smoke")
    Smoke,

    @SerialName("strobe")
    Strobe,
}

@Serializable
data class DmxChannel(
    val channel: Int = 1,
    val type: String = "dimmer",
    val defaultValue: Int? = null,
    val properties: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class MovingHeadConfig(
    val maxPan: Int = 540,
    val maxTilt: Int = 270,
)

@Serializable
data class DmxFixtureParty(
    val channelWeights: Map<String, Int> = emptyMap(),
    val strobeEnabled: Boolean = false,
    val strobeOnMs: Int = 80,
    val strobeOffMs: Int = 120,
)

@Serializable
data class DmxFixture(
    val id: String,
    val type: DmxFixtureType = DmxFixtureType.Other,
    val brand: String = "",
    val name: String = "",
    val dmxAddress: Int = 1,
    val movingHead: MovingHeadConfig = MovingHeadConfig(),
    val party: DmxFixtureParty = DmxFixtureParty(),
    val channels: List<DmxChannel> = emptyList(),
    val createdAt: String = nowIso(),
    val updatedAt: String = nowIso(),
)

@Serializable
enum class DmxPartyMode {
    @SerialName("auto")
    Auto,

    @SerialName("audio")
    Audio,
}

@Serializable
data class DmxPartyConfig(
    val enabled: Boolean = false,
    val mode: DmxPartyMode = DmxPartyMode.Auto,
    val fixtureIds: List<String> = emptyList(),
    val wledDeviceIds: List<String> = emptyList(),
    val intensity: Int = 70,
    val speed: Int = 60,
    val colorVariation: Int = 65,
    val audioSensitivity: Int = 65,
    val audioInputDeviceId: String? = null,
)

@Serializable
data class DmxPartyAudioFeatures(
    val level: Double = 0.0,
    val bass: Double = 0.0,
    val mid: Double = 0.0,
    val treble: Double = 0.0,
    val beat: Double = 0.0,
    val bpm: Double = 0.0,
    val capturedAt: String? = null,
    val deviceId: String? = null,
)

@Serializable
data class DmxPartyState(
    val config: DmxPartyConfig = DmxPartyConfig(),
    val running: Boolean = false,
    val startedAt: String? = null,
    val lastTickAt: String? = null,
    val audioFeatures: DmxPartyAudioFeatures = DmxPartyAudioFeatures(),
)

@Serializable
data class DmxState(
    val fixtures: List<DmxFixture> = emptyList(),
    val selectedUSBDeviceId: String = "",
    val party: DmxPartyState = DmxPartyState(),
    val liveUniverse: List<Int> = emptyList(),
)

fun simulatedWledDevice(existing: WledDevice? = null): WledDevice {
    val fallbackState = mapOf(
        "on" to JsonPrimitive(true),
        "bri" to JsonPrimitive(180),
        "transition" to JsonPrimitive(7),
    )
    return WledDevice(
        id = SimulatedWledDeviceId,
        name = existing?.name?.takeIf { it.isNotBlank() } ?: "Simulated WLED",
        host = "simulated.local",
        address = "127.0.0.1",
        port = 80,
        lastSeen = nowIso(),
        online = true,
        provisioned = existing?.provisioned ?: false,
        ignored = existing?.ignored ?: false,
        info = existing?.info?.takeIf { it.isNotEmpty() } ?: mapOf(
            "on" to JsonPrimitive(true),
            "bri" to JsonPrimitive(180),
        ),
        lastState = existing?.lastState?.takeIf { it.isNotEmpty() } ?: fallbackState,
    )
}

fun ControllerSettings.withLegacyFieldsMerged(): ControllerSettings {
    val migratedWled = wled.copy(
        discovery = if (wled.discovery.serviceTypes.isEmpty() && discovery != null) discovery else wled.discovery,
        provisioning = if (wled.provisioning.defaultStatePayload.isEmpty() && provisioning != null) provisioning else wled.provisioning,
        testing = if (!wled.testing.simulateWled && testing?.simulateWled == true) testing else wled.testing,
    )
    return copy(
        wled = migratedWled,
        discovery = null,
        provisioning = null,
        testing = null,
    )
}

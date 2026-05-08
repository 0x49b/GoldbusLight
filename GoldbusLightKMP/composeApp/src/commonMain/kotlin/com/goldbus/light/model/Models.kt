package com.goldbus.light.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class AccessPointSettings(
    val enabled: Boolean = true,
    val connection: String = "wled-controller-ap",
    val interfaceName: String = "wlan0",
    val ssid: String = "WLED-Controller-Net",
    val password: String = "wled-control",
    val channel: Int = 6
)

@Serializable
data class DiscoverySettings(
    val enabled: Boolean = true,
    val serviceTypes: List<String> = listOf("_wled._tcp", "_http._tcp"),
    val intervalSeconds: Int = 15,
    val queryTimeoutMs: Int = 2000,
    val bindInterface: String = "",
    val passiveBrowse: Boolean = true,
    val subnetProbe: Boolean = false,
    val pollIntervalSecondsWhenApEnabled: Int = 5
)

@Serializable
data class ProvisioningSettings(
    val autoProvision: Boolean = false,
    val defaultStatePayload: JsonObject? = null,
    val defaultConfigPatch: JsonObject? = null
)

@Serializable
data class TestingSettings(
    val simulateWled: Boolean = false
)

@Serializable
data class ControllerSettings(
    val accessPoint: AccessPointSettings = AccessPointSettings(),
    val discovery: DiscoverySettings = DiscoverySettings(),
    val provisioning: ProvisioningSettings = ProvisioningSettings(),
    val testing: TestingSettings = TestingSettings()
)

@Serializable
data class WLEDDevice(
    val id: String,
    val name: String,
    val host: String,
    val address: String,
    val port: Int,
    val lastSeen: String, // Simplified as String for now, could be Instant
    val online: Boolean,
    val provisioned: Boolean,
    val ignored: Boolean = false,
    val info: JsonObject? = null,
    val lastState: JsonObject? = null
)

@Serializable
data class GeneralTabState(
    val on: Boolean = true,
    val bri: Int = 200,
    val rgb: List<Int> = listOf(255, 169, 87),
    val fx: Int = 0,
    val pal: Int = 0,
    val sx: Int = 128,
    val ix: Int = 128
)

@Serializable
data class ControllerCapabilities(
    val networkBackendId: String,
    val networkBackendLabel: String,
    val networkControlAvailable: Boolean,
    val networkCliName: String,
    val networkCliUnavailableReason: String? = null,
    val nmcliAvailable: Boolean
)

@Serializable
data class ControllerSnapshot(
    val settings: ControllerSettings,
    val devices: List<WLEDDevice>,
    val generalTabState: GeneralTabState,
    val persistencePath: String,
    val updatedAt: String,
    val capabilities: ControllerCapabilities
)

@Serializable
data class WLEDDeviceDetail(
    val online: Boolean,
    val error: String? = null,
    val state: JsonObject? = null,
    val info: JsonObject? = null,
    val effects: List<String> = emptyList(),
    val palettes: List<String> = emptyList(),
    val config: JsonObject? = null,
    val lastState: JsonObject? = null,
    val address: String,
    val port: Int
)

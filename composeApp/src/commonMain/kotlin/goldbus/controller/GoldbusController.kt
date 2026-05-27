package goldbus.controller

import goldbus.domain.ControllerSettings
import goldbus.domain.ControllerSnapshot
import goldbus.domain.GeneralTabState
import goldbus.domain.PersistentState
import goldbus.domain.PersistentStateVersion
import goldbus.domain.SimulatedWledDeviceId
import goldbus.domain.TestingSettings
import goldbus.domain.WledDevice
import goldbus.domain.nowIso
import goldbus.domain.simulatedWledDevice
import goldbus.domain.withLegacyFieldsMerged
import goldbus.persistence.StateRepository
import goldbus.wled.WledClient
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class GoldbusController(
    private val stateRepository: StateRepository,
    private val wledClient: WledClient,
) {
    private val mutex = Mutex()
    private var settings = ControllerSettings()
    private var devices = emptyMap<String, WledDevice>()
    private var generalTabState = GeneralTabState()

    private val _snapshot = MutableStateFlow(
        ControllerSnapshot(persistencePath = stateRepository.persistencePath),
    )
    val snapshot: StateFlow<ControllerSnapshot> = _snapshot.asStateFlow()

    suspend fun start() {
        val loaded = stateRepository.loadState()
        val loadedGeneral = stateRepository.loadGeneralTabState()
        mutex.withLock {
            settings = loaded.settings.withLegacyFieldsMerged()
            devices = loaded.devices
            generalTabState = loadedGeneral.clamped()
            syncSimulatedDeviceLocked()
            publishLocked()
        }
    }

    suspend fun stop() {
        mutex.withLock {
            saveLocked()
        }
        wledClient.close()
    }

    suspend fun setWledEnabled(enabled: Boolean) {
        mutex.withLock {
            settings = settings.copy(wled = settings.wled.copy(enabled = enabled))
            syncSimulatedDeviceLocked()
            saveLocked()
            publishLocked()
        }
    }

    suspend fun setSimulateWled(enabled: Boolean) {
        mutex.withLock {
            settings = settings.copy(
                wled = settings.wled.copy(testing = TestingSettings(simulateWled = enabled)),
            )
            syncSimulatedDeviceLocked()
            saveLocked()
            publishLocked()
        }
    }

    suspend fun addManualDevice(name: String, host: String, port: Int = 80) {
        val cleanHost = host.trim()
        if (cleanHost.isBlank()) {
            return
        }
        val id = "manual:${cleanHost.lowercase()}:$port"
        val displayName = name.trim().ifBlank { cleanHost }
        mutex.withLock {
            devices = devices + (
                id to WledDevice(
                    id = id,
                    name = displayName,
                    host = cleanHost,
                    address = cleanHost,
                    port = port.coerceIn(1, 65_535),
                    online = true,
                    lastSeen = nowIso(),
                )
            )
            saveLocked()
            publishLocked()
        }
    }

    suspend fun setDeviceIgnored(deviceId: String, ignored: Boolean) {
        mutex.withLock {
            val existing = devices[deviceId] ?: return
            devices = devices + (deviceId to existing.copy(ignored = ignored))
            saveLocked()
            publishLocked()
        }
    }

    suspend fun removeDevice(deviceId: String) {
        mutex.withLock {
            devices = devices - deviceId
            syncSimulatedDeviceLocked()
            saveLocked()
            publishLocked()
        }
    }

    suspend fun applyGeneralState(next: GeneralTabState): Map<String, String> {
        return applyWledState(next.clamped().toWledStatePayload())
    }

    suspend fun applyWledState(state: JsonObject): Map<String, String> {
        val (currentSettings, targets) = mutex.withLock {
            if (!settings.wled.enabled) {
                return emptyMap()
            }
            settings to devices.values
                .filter { it.online && !it.ignored }
                .sortedBy { it.name.lowercase() }
        }

        val results = coroutineScope {
            targets.map { device ->
                async {
                    val result = runCatching {
                        if (!(currentSettings.wled.testing.simulateWled && device.id == SimulatedWledDeviceId)) {
                            wledClient.applyState(device, state)
                        }
                    }
                    device.id to result.fold(onSuccess = { "ok" }, onFailure = { it.message ?: "failed" })
                }
            }.awaitAll().toMap()
        }

        mutex.withLock {
            generalTabState = generalTabState.mergeWledPatch(state)
            devices = devices.mapValues { (id, device) ->
                if (device.ignored) {
                    device
                } else {
                    val lastState = device.lastState + state
                    if (results[id] == "ok") {
                        device.copy(
                            lastSeen = nowIso(),
                            online = true,
                            info = device.info.withWledInfo(state),
                            lastState = lastState,
                        )
                    } else {
                        device.copy(lastState = lastState)
                    }
                }
            }
            stateRepository.saveGeneralTabState(generalTabState)
            saveLocked()
            publishLocked()
        }
        return results
    }

    private fun syncSimulatedDeviceLocked() {
        devices = if (settings.wled.enabled && settings.wled.testing.simulateWled) {
            devices + (SimulatedWledDeviceId to simulatedWledDevice(devices[SimulatedWledDeviceId]))
        } else {
            devices - SimulatedWledDeviceId
        }
    }

    private suspend fun saveLocked() {
        stateRepository.saveState(
            PersistentState(
                version = PersistentStateVersion,
                savedAt = nowIso(),
                settings = settings,
                devices = devices,
            ),
        )
    }

    private fun publishLocked() {
        _snapshot.update {
            ControllerSnapshot(
                settings = settings,
                devices = devices.values.sortedBy { device -> device.name.lowercase() },
                generalTabState = generalTabState,
                persistencePath = stateRepository.persistencePath,
                updatedAt = nowIso(),
            )
        }
    }
}

fun GeneralTabState.clamped(): GeneralTabState {
    fun clamp255(value: Int) = value.coerceIn(0, 255)
    val paddedRgb = (rgb + listOf(0, 0, 0)).take(3).map(::clamp255)
    return copy(
        bri = clamp255(bri),
        rgb = paddedRgb,
        fx = fx.coerceAtLeast(0),
        pal = pal.coerceAtLeast(0),
        sx = clamp255(sx),
        ix = clamp255(ix),
    )
}

fun GeneralTabState.toWledStatePayload(): JsonObject {
    val safe = clamped()
    return buildJsonObject {
        put("on", safe.on)
        put("bri", safe.bri)
        put(
            "seg",
            buildJsonArray {
                add(
                    buildJsonObject {
                        put(
                            "col",
                            buildJsonArray {
                                add(
                                    buildJsonArray {
                                        safe.rgb.forEach { add(JsonPrimitive(it)) }
                                    },
                                )
                            },
                        )
                        put("fx", safe.fx)
                        put("pal", safe.pal)
                        put("sx", safe.sx)
                        put("ix", safe.ix)
                    },
                )
            },
        )
    }
}

private fun GeneralTabState.mergeWledPatch(patch: JsonObject): GeneralTabState {
    var next = this
    patch["on"]?.jsonPrimitive?.booleanOrNull?.let { next = next.copy(on = it) }
    patch["bri"]?.jsonPrimitive?.intOrNull?.let { next = next.copy(bri = it) }

    val firstSegment = patch["seg"]
        ?.let { it as? JsonArray }
        ?.firstOrNull()
        ?.let { it as? JsonObject }
        ?: return next.clamped()

    firstSegment["fx"]?.jsonPrimitive?.intOrNull?.let { next = next.copy(fx = it) }
    firstSegment["pal"]?.jsonPrimitive?.intOrNull?.let { next = next.copy(pal = it) }
    firstSegment["sx"]?.jsonPrimitive?.intOrNull?.let { next = next.copy(sx = it) }
    firstSegment["ix"]?.jsonPrimitive?.intOrNull?.let { next = next.copy(ix = it) }
    firstSegment.rgbFromColorArray()?.let { next = next.copy(rgb = it) }
    return next.clamped()
}

private fun JsonObject.rgbFromColorArray(): List<Int>? {
    val outer = this["col"]?.jsonArray ?: return null
    val firstColor = outer.firstOrNull()?.jsonArray ?: return null
    if (firstColor.size < 3) {
        return null
    }
    return firstColor.take(3).mapNotNull { it.jsonPrimitive.intOrNull }.takeIf { it.size == 3 }
}

private fun Map<String, JsonElement>.withWledInfo(patch: JsonObject): Map<String, JsonElement> {
    val next = toMutableMap()
    patch["on"]?.let { next["on"] = it }
    patch["bri"]?.let { next["bri"] = it }
    patch["ps"]?.let { next["ps"] = it }
    return next
}

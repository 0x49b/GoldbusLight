package goldbus.controller

import goldbus.domain.GeneralTabState
import goldbus.domain.PersistentState
import goldbus.domain.SimulatedWledDeviceId
import goldbus.domain.TestingSettings
import goldbus.domain.WledSettings
import goldbus.domain.ControllerSettings
import goldbus.persistence.StateRepository
import goldbus.wled.WledClient
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GoldbusControllerTest {
    @Test
    fun simulatedDeviceIsAddedAndUpdatedWithoutHttp() = runBlocking {
        val repository = InMemoryStateRepository(
            initialState = PersistentState(
                settings = ControllerSettings(
                    wled = WledSettings(testing = TestingSettings(simulateWled = true)),
                ),
            ),
        )
        val client = RecordingWledClient()
        val controller = GoldbusController(repository, client)

        controller.start()
        val results = controller.applyGeneralState(GeneralTabState(bri = 120, rgb = listOf(1, 2, 3)))

        assertEquals(mapOf(SimulatedWledDeviceId to "ok"), results)
        assertEquals(0, client.sent.size)
        val simulated = controller.snapshot.value.devices.single()
        assertEquals(120, simulated.lastState["bri"]?.toString()?.toInt())
        assertTrue(repository.savedGeneral.bri == 120)
    }

    @Test
    fun wledPayloadClampsGeneralValues() {
        val payload = GeneralTabState(
            bri = 300,
            rgb = listOf(-1, 12, 999),
            fx = -2,
            pal = 7,
            sx = 500,
            ix = -8,
        ).toWledStatePayload()

        assertEquals("255", payload["bri"].toString())
        val segment = payload["seg"].toString()
        assertTrue(segment.contains("[0,12,255]"))
        assertTrue(segment.contains("\"fx\":0"))
        assertTrue(segment.contains("\"sx\":255"))
        assertTrue(segment.contains("\"ix\":0"))
    }
}

private class InMemoryStateRepository(
    private var initialState: PersistentState = PersistentState(),
    private var initialGeneral: GeneralTabState = GeneralTabState(),
) : StateRepository {
    var savedGeneral: GeneralTabState = initialGeneral
    override val persistencePath: String = "memory://state.json"

    override suspend fun loadState(): PersistentState = initialState

    override suspend fun saveState(state: PersistentState) {
        initialState = state
    }

    override suspend fun loadGeneralTabState(): GeneralTabState = initialGeneral

    override suspend fun saveGeneralTabState(state: GeneralTabState) {
        savedGeneral = state
        initialGeneral = state
    }
}

private class RecordingWledClient : WledClient {
    val sent = mutableListOf<Pair<String, JsonObject>>()

    override suspend fun applyState(device: goldbus.domain.WledDevice, state: JsonObject) {
        sent += device.id to state
    }

    override suspend fun close() = Unit
}

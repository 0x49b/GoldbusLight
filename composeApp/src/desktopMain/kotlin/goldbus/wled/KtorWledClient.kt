package goldbus.wled

import goldbus.domain.WledDevice
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.contentType
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

class KtorWledClient : WledClient {
    @OptIn(ExperimentalSerializationApi::class)
    private val json = Json {
        explicitNulls = false
        ignoreUnknownKeys = true
    }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(json)
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 4_000
            connectTimeoutMillis = 4_000
            socketTimeoutMillis = 4_000
        }
    }

    override suspend fun applyState(device: WledDevice, state: JsonObject) {
        val response = client.post("${baseHttpUrl(device)}/json/state") {
            contentType(ContentType.Application.Json)
            setBody(state)
        }
        if (!response.status.isSuccess()) {
            val body = runCatching { response.body<String>() }.getOrDefault("")
            error("POST /json/state failed for ${device.name}: ${response.status.value} $body")
        }
    }

    override suspend fun close() {
        client.close()
    }
}

package goldbus.wled

import goldbus.domain.WledDevice
import kotlinx.serialization.json.JsonObject

interface WledClient {
    suspend fun applyState(device: WledDevice, state: JsonObject)

    suspend fun close()
}

fun hostForHttp(host: String, address: String): String {
    val normalizedHost = host.trim().trimEnd('.')
    if (normalizedHost.endsWith(".local", ignoreCase = true)) {
        return normalizedHost
    }
    return address.trim().ifBlank { normalizedHost }
}

fun baseHttpUrl(device: WledDevice): String {
    val host = hostForHttp(device.host, device.address)
    val bracketedHost = if (host.contains(":") && !host.startsWith("[")) "[$host]" else host
    return "http://$bracketedHost:${device.port}"
}

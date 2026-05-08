package com.goldbus.light.api

import com.goldbus.light.model.WLEDDevice
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

class WLEDClient(private val httpClient: HttpClient) {

    suspend fun getFullJson(device: WLEDDevice): JsonObject {
        return httpClient.get(device.baseUrl() + "/json").body()
    }

    suspend fun getState(device: WLEDDevice): JsonObject {
        return httpClient.get(device.baseUrl() + "/json/state").body()
    }

    suspend fun applyState(device: WLEDDevice, state: JsonObject) {
        httpClient.post(device.baseUrl() + "/json/state") {
            contentType(ContentType.Application.Json)
            setBody(state)
        }
    }

    suspend fun getConfig(device: WLEDDevice): JsonObject {
        return httpClient.get(device.baseUrl() + "/json/cfg").body()
    }

    suspend fun applyCfgPatch(device: WLEDDevice, patch: JsonObject) {
        httpClient.post(device.baseUrl() + "/json/cfg") {
            contentType(ContentType.Application.Json)
            setBody(patch)
        }
    }

    private fun WLEDDevice.baseUrl(): String {
        return "http://${address}:${port}"
    }

    companion object {
        fun create(): WLEDClient {
            return WLEDClient(HttpClient {
                install(ContentNegotiation) {
                    json()
                }
                install(HttpTimeout) {
                    requestTimeoutMillis = 4000
                }
            })
        }
    }
}

package com.goldbus.light.network

import com.goldbus.light.model.ControllerSettings
import java.io.BufferedReader
import java.io.InputStreamReader

class NetworkManager {

    fun apply(settings: ControllerSettings) {
        val ap = settings.accessPoint
        if (!ap.enabled) return

        val connectionName = ap.connection.ifBlank { "wled-controller-ap" }
        val iface = ap.interfaceName.ifBlank { "wlan0" }
        val ssid = ap.ssid.ifBlank { "WLED-Controller-Net" }

        if (!connectionExists(connectionName)) {
            execute("nmcli", "connection", "add", "type", "wifi", "ifname", iface, "con-name", connectionName, "autoconnect", "yes", "ssid", ssid)
        }

        execute(
            "nmcli", "connection", "modify", connectionName,
            "802-11-wireless.mode", "ap",
            "802-11-wireless.band", "bg",
            "802-11-wireless.channel", ap.channel.toString(),
            "802-11-wireless.ssid", ssid,
            "wifi-sec.key-mgmt", "wpa-psk",
            "wifi-sec.psk", ap.password,
            "ipv4.method", "shared"
        )
        
        execute("nmcli", "connection", "up", connectionName)
    }

    private fun connectionExists(name: String): Boolean {
        val output = execute("nmcli", "-t", "-f", "NAME", "connection", "show")
        return output.lines().any { it.trim() == name }
    }

    private fun execute(vararg command: String): String {
        val process = ProcessBuilder(*command)
            .redirectErrorStream(true)
            .start()
        
        val output = BufferedReader(InputStreamReader(process.inputStream)).use { it.readText() }
        process.waitFor()
        return output
    }
}

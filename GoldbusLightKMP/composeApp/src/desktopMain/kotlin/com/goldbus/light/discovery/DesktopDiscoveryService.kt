package com.goldbus.light.discovery

import com.goldbus.light.model.WLEDDevice
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.net.InetAddress
import javax.jmdns.JmDNS
import javax.jmdns.ServiceEvent
import javax.jmdns.ServiceListener

class DesktopDiscoveryService : DiscoveryService {

    override fun discover(serviceType: String): Flow<WLEDDevice> = callbackFlow {
        val jmdns = JmDNS.create(InetAddress.getLocalHost())
        
        val listener = object : ServiceListener {
            override fun serviceAdded(event: ServiceEvent) {
                jmdns.requestServiceInfo(event.type, event.name)
            }

            override fun serviceRemoved(event: ServiceEvent) {
            }

            override fun serviceResolved(event: ServiceEvent) {
                val info = event.info
                val address = info.inet4Addresses.firstOrNull()?.hostAddress ?: info.inet6Addresses.firstOrNull()?.hostAddress ?: ""
                val device = WLEDDevice(
                    id = info.getPropertyString("mac") ?: "${address}:${info.port}",
                    name = info.name,
                    host = info.server,
                    address = address,
                    port = info.port,
                    lastSeen = java.time.Instant.now().toString(),
                    online = true,
                    provisioned = false
                )
                trySend(device)
            }
        }

        jmdns.addServiceListener(serviceType, listener)

        awaitClose {
            jmdns.removeServiceListener(serviceType, listener)
            jmdns.close()
        }
    }
}

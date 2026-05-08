package com.goldbus.light.discovery

import com.goldbus.light.model.WLEDDevice
import kotlinx.coroutines.flow.Flow

interface DiscoveryService {
    fun discover(serviceType: String = "_wled._tcp.local."): Flow<WLEDDevice>
}

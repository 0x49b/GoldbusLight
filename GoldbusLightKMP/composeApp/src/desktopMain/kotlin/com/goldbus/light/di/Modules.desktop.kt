package com.goldbus.light.di

import com.goldbus.light.discovery.DesktopDiscoveryService
import com.goldbus.light.discovery.DiscoveryService
import org.koin.dsl.module

val desktopModule = module {
    single<DiscoveryService> { DesktopDiscoveryService() }
}

package com.goldbus.light.di

import com.goldbus.light.api.WLEDClient
import com.goldbus.light.viewmodel.MainViewModel
import org.koin.core.module.dsl.factoryOf
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

val commonModule = module {
    single { WLEDClient.create() }
    factoryOf(::MainViewModel)
}

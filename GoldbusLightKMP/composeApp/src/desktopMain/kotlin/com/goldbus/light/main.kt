package com.goldbus.light

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.goldbus.light.di.commonModule
import com.goldbus.light.di.desktopModule
import com.goldbus.light.ui.App
import org.koin.core.context.startKoin

fun main() {
    startKoin {
        modules(commonModule, desktopModule)
    }
    
    application {
        val state = rememberWindowState()
        Window(
            onCloseRequest = ::exitApplication,
            state = state,
            title = "Goldbus Light Controller"
        ) {
            App()
        }
    }
}
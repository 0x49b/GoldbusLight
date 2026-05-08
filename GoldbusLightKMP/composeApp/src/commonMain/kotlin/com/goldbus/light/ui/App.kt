package com.goldbus.light.ui

import androidx.compose.runtime.*
import com.goldbus.light.ui.screens.DashboardScreen
import com.goldbus.light.ui.screens.DevicesScreen
import com.goldbus.light.ui.screens.SettingsScreen
import com.goldbus.light.viewmodel.MainViewModel
import org.koin.compose.KoinContext
import org.koin.compose.viewmodel.koinViewModel

import io.github.composefluent.FluentTheme
import io.github.composefluent.background.Mica
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier

@Composable
fun App() {
    FluentTheme {
        Mica(Modifier.fillMaxSize()) {
            KoinContext {
                var currentScreen by remember { mutableStateOf<Screen>(Screen.Dashboard) }
                val viewModel = koinViewModel<MainViewModel>()
                val devices by viewModel.devices.collectAsState()
                
                when (currentScreen) {
                    Screen.Dashboard -> DashboardScreen(onNavigate = { currentScreen = it })
                    Screen.Devices -> DevicesScreen(devices, onDiscover = { viewModel.startDiscovery() }, onNavigate = { currentScreen = it })
                    Screen.Settings -> SettingsScreen(onNavigate = { currentScreen = it })
                }
            }
        }
    }
}

sealed class Screen {
    object Dashboard : Screen()
    object Devices : Screen()
    object Settings : Screen()
}
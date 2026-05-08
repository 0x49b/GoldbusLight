package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.goldbus.light.ui.Screen // Import the Screen sealed class
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.Button
import io.github.composefluent.component.Switcher
import io.github.composefluent.component.Text as FluentText

@Composable
fun SettingsScreen(onNavigate: (Screen) -> Unit) {
    var apEnabled by remember { mutableStateOf(true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            FluentText("Settings", style = FluentTheme.typography.titleLarge)
            Button(onClick = { onNavigate(Screen.Dashboard) }) {
                FluentText("Back")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        FluentText("Access Point Settings", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    FluentText("Enable Access Point", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = apEnabled, onCheckStateChange = { apEnabled = it })
                }
                
                Column {
                    FluentText("SSID", style = FluentTheme.typography.caption)
                }
                
                Column {
                    FluentText("Password", style = FluentTheme.typography.caption)
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        FluentText("Discovery Settings", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    FluentText("Passive Browse", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = true, onCheckStateChange = {})
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    FluentText("Subnet Probe", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = false, onCheckStateChange = {})
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = { /* Save */ }, modifier = Modifier.fillMaxWidth()) {
            FluentText("Save Settings")
        }
    }
}

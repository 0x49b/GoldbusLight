package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.goldbus.light.ui.Screen
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.*

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
            Text("Settings", style = FluentTheme.typography.titleLarge)
            Button(onClick = { onNavigate(Screen.Dashboard) }) {
                Text("Back")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text("Access Point Settings", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Enable Access Point", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = apEnabled, onCheckStateChange = { apEnabled = it })
                }
                
                Column {
                    Text("SSID", style = FluentTheme.typography.caption)
                }
                
                Column {
                    Text("Password", style = FluentTheme.typography.caption)
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text("Discovery Settings", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Passive Browse", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = true, onCheckStateChange = {})
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Subnet Probe", style = FluentTheme.typography.bodyLarge)
                    Switcher(checked = false, onCheckStateChange = {})
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = { /* Save */ }, modifier = Modifier.fillMaxWidth()) {
            Text("Save Settings")
        }
    }
}

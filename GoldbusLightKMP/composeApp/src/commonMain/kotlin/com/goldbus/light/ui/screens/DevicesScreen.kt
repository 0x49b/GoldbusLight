package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import com.goldbus.light.model.WLEDDevice
import com.goldbus.light.ui.Screen
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.*

@Composable
fun DevicesScreen(devices: List<WLEDDevice>, onDiscover: () -> Unit, onNavigate: (Screen) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Devices", style = FluentTheme.typography.titleLarge)
                Text(
                    "${devices.size} devices found",
                    style = FluentTheme.typography.caption,
                    color = Color(FluentTheme.colors.text.text.secondary)
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onDiscover) {
                    Text("Refresh")
                }
                Button(onClick = { onNavigate(Screen.Dashboard) }) {
                    Text("Back")
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (devices.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No devices found.", style = FluentTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(devices) { device ->
                    Card(modifier = Modifier.fillMaxWidth(), onClick = { /* Navigate to detail */ }) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(device.name, style = FluentTheme.typography.bodyLarge)
                                Text(
                                    device.address,
                                    style = FluentTheme.typography.caption,
                                    color = Color(FluentTheme.colors.text.text.secondary)
                                )
                            }
                            Switcher(
                                checked = device.online,
                                onCheckStateChange = { /* Toggle */ }
                            )
                        }
                    }
                }
            }
        }
    }
}

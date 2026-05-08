package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.Button
import io.github.composefluent.component.Switcher
import io.github.composefluent.component.Text as FluentText
import com.goldbus.light.model.WLEDDevice // Import the WLEDDevice data class
import com.goldbus.light.ui.Screen // Import the Screen sealed class

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
                FluentText("Devices", style = FluentTheme.typography.titleLarge)
                FluentText(
                    "${devices.size} devices found",
                    style = FluentTheme.typography.caption,
                    color = FluentTheme.colors.text.text.secondary
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onDiscover) {
                    FluentText("Refresh")
                }
                Button(onClick = { onNavigate(Screen.Dashboard) }) {
                    FluentText("Back")
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (devices.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                FluentText("No devices found.", style = FluentTheme.typography.bodyLarge)
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
                                FluentText(device.name, style = FluentTheme.typography.bodyLarge)
                                FluentText(
                                    device.address,
                                    style = FluentTheme.typography.caption,
                                    color = FluentTheme.colors.text.text.secondary
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

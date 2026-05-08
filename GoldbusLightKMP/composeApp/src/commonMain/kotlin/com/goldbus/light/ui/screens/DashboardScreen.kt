package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.Button
import io.github.composefluent.component.Slider
import io.github.composefluent.component.Text as FluentText
import com.goldbus.light.ui.Screen // Import the Screen sealed class

@Composable
fun DashboardScreen(onNavigate: (Screen) -> Unit) {
    var brightness by remember { mutableStateOf(128f) }
    var speed by remember { mutableStateOf(128f) }
    var intensity by remember { mutableStateOf(128f) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        FluentText("General", style = FluentTheme.typography.titleLarge)
        FluentText(
            "Control all WLED devices together.",
            style = FluentTheme.typography.caption,
            color = FluentTheme.colors.text.text.secondary
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { /* All On */ }, modifier = Modifier.weight(1f)) {
                        FluentText("All On")
                    }
                    Button(onClick = { /* All Off */ }, modifier = Modifier.weight(1f)) {
                        FluentText("All Off")
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { /* Warm White */ }, modifier = Modifier.weight(1f)) {
                        FluentText("Warm White")
                    }
                    Button(onClick = { /* Cold White */ }, modifier = Modifier.weight(1f)) {
                        FluentText("Cold White")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        FluentText("Color & Brightness", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                FluentText("Brightness: ${brightness.toInt()}", style = FluentTheme.typography.caption)
                Slider(
                    value = brightness,
                    onValueChange = { brightness = it },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        FluentText("Effect Parameters", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                FluentText("Speed: ${speed.toInt()}", style = FluentTheme.typography.caption)
                Slider(
                    value = speed,
                    onValueChange = { speed = it },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                FluentText("Intensity: ${intensity.toInt()}", style = FluentTheme.typography.caption)
                Slider(
                    value = intensity,
                    onValueChange = { intensity = it },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(onClick = { onNavigate(Screen.Devices) }) {
                FluentText("Manage Devices")
            }
            Button(onClick = { onNavigate(Screen.Settings) }) {
                FluentText("Settings")
            }
        }
    }
}

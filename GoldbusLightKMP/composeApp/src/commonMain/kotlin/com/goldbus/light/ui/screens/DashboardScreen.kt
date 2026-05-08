package com.goldbus.light.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import com.goldbus.light.ui.Screen
import io.github.composefluent.FluentTheme
import io.github.composefluent.surface.Card
import io.github.composefluent.component.*

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
        Text("General", style = FluentTheme.typography.titleLarge)
        Text(
            "Control all WLED devices together.",
            style = FluentTheme.typography.caption,
            color = Color(FluentTheme.colors.text.text.secondary)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { /* All On */ }, modifier = Modifier.weight(1f)) {
                        Text("All On")
                    }
                    Button(onClick = { /* All Off */ }, modifier = Modifier.weight(1f)) {
                        Text("All Off")
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { /* Warm White */ }, modifier = Modifier.weight(1f)) {
                        Text("Warm White")
                    }
                    Button(onClick = { /* Cold White */ }, modifier = Modifier.weight(1f)) {
                        Text("Cold White")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text("Color & Brightness", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Brightness: ${brightness.toInt()}", style = FluentTheme.typography.caption)
                Slider(
                    value = brightness,
                    onValueChange = { brightness = it },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text("Effect Parameters", style = FluentTheme.typography.bodyLarge)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Speed: ${speed.toInt()}", style = FluentTheme.typography.caption)
                Slider(
                    value = speed,
                    onValueChange = { speed = it },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text("Intensity: ${intensity.toInt()}", style = FluentTheme.typography.caption)
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
                Text("Manage Devices")
            }
            Button(onClick = { onNavigate(Screen.Settings) }) {
                Text("Settings")
            }
        }
    }
}

package goldbus.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import goldbus.controller.GoldbusController
import goldbus.domain.ControllerSnapshot
import goldbus.domain.GeneralTabState
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun GoldbusApp(controller: GoldbusController) {
    val snapshot by controller.snapshot.collectAsState()
    val scope = rememberCoroutineScope()
    var lastResult by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Row(Modifier.fillMaxSize()) {
                Sidebar(snapshot)
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState())
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Header(snapshot)
                    PresetsCard(
                        state = snapshot.generalTabState,
                        onApply = { next ->
                            scope.launch {
                                lastResult = controller.applyGeneralState(next)
                            }
                        },
                    )
                    DeviceCard(
                        snapshot = snapshot,
                        lastResult = lastResult,
                        onAddDevice = { name, host, port ->
                            scope.launch { controller.addManualDevice(name, host, port) }
                        },
                        onToggleIgnored = { id, ignored ->
                            scope.launch { controller.setDeviceIgnored(id, ignored) }
                        },
                        onRemove = { id ->
                            scope.launch { controller.removeDevice(id) }
                        },
                    )
                    SettingsCard(
                        snapshot = snapshot,
                        onWledEnabled = { scope.launch { controller.setWledEnabled(it) } },
                        onSimulateWled = { scope.launch { controller.setSimulateWled(it) } },
                    )
                    DeferredFeatureCard()
                }
            }
        }
    }
}

@Composable
private fun Sidebar(snapshot: ControllerSnapshot) {
    Column(
        modifier = Modifier
            .width(280.dp)
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Goldbus", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Kotlin Multiplatform Desktop", style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        NavItem("WLED Presets", "Running slice")
        NavItem("Devices", "${snapshot.devices.size} known")
        NavItem("Settings", "Persistence + simulation")
        NavItem("DMX Universe", "Model ported")
        NavItem("Party Mode", "Model ported")
        Spacer(Modifier.weight(1f))
        Text("Config", style = MaterialTheme.typography.labelLarge)
        Text(snapshot.persistencePath, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun NavItem(title: String, subtitle: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Header(snapshot: ControllerSnapshot) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text("Light Controller", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text("Updated ${snapshot.updatedAt}", style = MaterialTheme.typography.bodyMedium)
        }
        StatusPill(
            text = if (snapshot.settings.wled.enabled) "WLED enabled" else "WLED disabled",
            positive = snapshot.settings.wled.enabled,
        )
    }
}

@Composable
private fun PresetsCard(
    state: GeneralTabState,
    onApply: (GeneralTabState) -> Unit,
) {
    var draft by remember(state) { mutableStateOf(state) }

    Card {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Global WLED Preset", style = MaterialTheme.typography.titleLarge)
                    Text("Applies the old General tab state to every online, non-ignored device.")
                }
                Switch(checked = draft.on, onCheckedChange = { draft = draft.copy(on = it) })
            }

            SliderRow("Brightness", draft.bri) { draft = draft.copy(bri = it) }
            SliderRow("Red", draft.rgb.component(0)) { draft = draft.withRgb(0, it) }
            SliderRow("Green", draft.rgb.component(1)) { draft = draft.withRgb(1, it) }
            SliderRow("Blue", draft.rgb.component(2)) { draft = draft.withRgb(2, it) }
            SliderRow("Effect", draft.fx, max = 255) { draft = draft.copy(fx = it) }
            SliderRow("Palette", draft.pal, max = 255) { draft = draft.copy(pal = it) }
            SliderRow("Speed", draft.sx) { draft = draft.copy(sx = it) }
            SliderRow("Intensity", draft.ix) { draft = draft.copy(ix = it) }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onApply(draft) }) {
                    Text("Apply to WLED devices")
                }
                OutlinedButton(onClick = { draft = GeneralTabState() }) {
                    Text("Goldbus warm white")
                }
            }
        }
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Int,
    max: Int = 255,
    onChange: (Int) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(label, modifier = Modifier.width(110.dp), fontWeight = FontWeight.Medium)
        Slider(
            value = value.toFloat(),
            valueRange = 0f..max.toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            modifier = Modifier.weight(1f),
        )
        Text(value.toString(), modifier = Modifier.width(42.dp))
    }
}

@Composable
private fun DeviceCard(
    snapshot: ControllerSnapshot,
    lastResult: Map<String, String>,
    onAddDevice: (String, String, Int) -> Unit,
    onToggleIgnored: (String, Boolean) -> Unit,
    onRemove: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("") }
    var portText by remember { mutableStateOf("80") }

    Card {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("WLED Devices", style = MaterialTheme.typography.titleLarge)
            if (snapshot.devices.isEmpty()) {
                Text("No persisted devices yet. Add one manually or enable simulation below.")
            }
            snapshot.devices.forEach { device ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(device.name, fontWeight = FontWeight.SemiBold)
                            Text("${device.host}:${device.port}  ${device.id}", style = MaterialTheme.typography.bodySmall)
                            Text("Last result: ${lastResult[device.id] ?: "not sent this session"}", style = MaterialTheme.typography.bodySmall)
                        }
                        StatusPill(if (device.online) "online" else "offline", device.online)
                        TextButton(onClick = { onToggleIgnored(device.id, !device.ignored) }) {
                            Text(if (device.ignored) "Use" else "Ignore")
                        }
                        TextButton(onClick = { onRemove(device.id) }) {
                            Text("Remove")
                        }
                    }
                }
            }

            HorizontalDivider(Modifier.padding(vertical = 4.dp))
            Text("Add manual WLED", fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.weight(1f))
                OutlinedTextField(host, { host = it }, label = { Text("Host or IP") }, modifier = Modifier.weight(1f))
                OutlinedTextField(portText, { portText = it.filter(Char::isDigit) }, label = { Text("Port") }, modifier = Modifier.width(110.dp))
                Button(
                    onClick = {
                        onAddDevice(name, host, portText.toIntOrNull() ?: 80)
                        name = ""
                        host = ""
                        portText = "80"
                    },
                    enabled = host.isNotBlank(),
                ) {
                    Text("Add")
                }
            }
        }
    }
}

@Composable
private fun SettingsCard(
    snapshot: ControllerSnapshot,
    onWledEnabled: (Boolean) -> Unit,
    onSimulateWled: (Boolean) -> Unit,
) {
    Card {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Settings", style = MaterialTheme.typography.titleLarge)
            SettingsSwitch("WLED component", snapshot.settings.wled.enabled, onWledEnabled)
            SettingsSwitch("Simulate WLED device", snapshot.settings.wled.testing.simulateWled, onSimulateWled)
            Text("Network/AP, mDNS discovery, USB-DMX, Art-Net, and Party engines are represented in models and ready for subsequent backend ports.")
        }
    }
}

@Composable
private fun SettingsSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontWeight = FontWeight.Medium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun DeferredFeatureCard() {
    Card {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Porting status", style = MaterialTheme.typography.titleLarge)
            Text("This Compose app replaces the Wails shell and ports the first runtime path: compatible settings, WLED devices, JSON persistence, and global preset control.")
            Text("DMX, Art-Net, USB serial, mDNS discovery, audio-reactive Party mode, and 3D previews have Kotlin domain models in this branch and can be filled in behind the same controller/state-flow boundary.")
        }
    }
}

@Composable
private fun StatusPill(text: String, positive: Boolean) {
    val color = if (positive) Color(0xff2e7d32) else Color(0xff9e2a2b)
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(text, color = color, style = MaterialTheme.typography.labelLarge)
    }
}

private fun GeneralTabState.withRgb(index: Int, value: Int): GeneralTabState {
    val next = (rgb + listOf(0, 0, 0)).take(3).toMutableList()
    next[index] = value
    return copy(rgb = next)
}

private fun List<Int>.component(index: Int): Int = getOrNull(index) ?: 0

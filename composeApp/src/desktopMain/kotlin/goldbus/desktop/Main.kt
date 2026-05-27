package goldbus.desktop

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import goldbus.controller.GoldbusController
import goldbus.persistence.DesktopStateRepository
import goldbus.ui.GoldbusApp
import goldbus.wled.KtorWledClient
import kotlinx.coroutines.runBlocking

fun main() = application {
    val controller = remember {
        GoldbusController(
            stateRepository = DesktopStateRepository(),
            wledClient = KtorWledClient(),
        )
    }
    val fullscreen = System.getenv("GOLDBUS_FULLSCREEN") == "1"
    val windowState = rememberWindowState(
        width = 1400.dp,
        height = 820.dp,
        placement = if (fullscreen) WindowPlacement.Fullscreen else WindowPlacement.Floating,
    )

    LaunchedEffect(controller) {
        controller.start()
    }

    Window(
        onCloseRequest = {
            runBlocking { controller.stop() }
            exitApplication()
        },
        title = "Goldbus Light Controller",
        state = windowState,
    ) {
        GoldbusApp(controller)
    }
}

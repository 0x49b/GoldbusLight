package goldbus.persistence

import goldbus.domain.GeneralTabState
import goldbus.domain.PersistentState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText

class DesktopStateRepository(
    private val configDirectory: Path = defaultConfigDirectory(),
) : StateRepository {
    private val stateFile = configDirectory.resolve("state.json")
    private val generalTabFile = configDirectory.resolve("general-tab-state.json")

    override val persistencePath: String = stateFile.toAbsolutePath().toString()

    override suspend fun loadState(): PersistentState = withContext(Dispatchers.IO) {
        if (!stateFile.exists()) {
            PersistentState()
        } else {
            runCatching { appJson.decodeFromString<PersistentState>(stateFile.readText()) }
                .getOrElse { PersistentState() }
        }
    }

    override suspend fun saveState(state: PersistentState) = withContext(Dispatchers.IO) {
        writeJsonAtomically(stateFile, appJson.encodeToString(PersistentState.serializer(), state))
    }

    override suspend fun loadGeneralTabState(): GeneralTabState = withContext(Dispatchers.IO) {
        if (!generalTabFile.exists()) {
            GeneralTabState()
        } else {
            runCatching { appJson.decodeFromString<GeneralTabState>(generalTabFile.readText()) }
                .getOrElse { GeneralTabState() }
        }
    }

    override suspend fun saveGeneralTabState(state: GeneralTabState) = withContext(Dispatchers.IO) {
        writeJsonAtomically(generalTabFile, appJson.encodeToString(GeneralTabState.serializer(), state))
    }

    private fun writeJsonAtomically(path: Path, payload: String) {
        Files.createDirectories(path.parent)
        val tmp = path.resolveSibling("${path.fileName}.tmp")
        tmp.writeText(payload)
        runCatching {
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        }.getOrElse {
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING)
        }
    }
}

private fun defaultConfigDirectory(): Path {
    val userHome = Path.of(System.getProperty("user.home", "."))
    val osName = System.getProperty("os.name", "").lowercase()
    val base = when {
        osName.contains("win") -> System.getenv("APPDATA")?.let(Path::of)
            ?: userHome.resolve("AppData").resolve("Roaming")

        osName.contains("mac") || osName.contains("darwin") -> userHome
            .resolve("Library")
            .resolve("Application Support")

        else -> System.getenv("XDG_CONFIG_HOME")?.takeIf { it.isNotBlank() }?.let(Path::of)
            ?: userHome.resolve(".config")
    }
    return base.resolve("wled-controller")
}

@OptIn(ExperimentalSerializationApi::class)
private val appJson = Json {
    encodeDefaults = true
    explicitNulls = false
    ignoreUnknownKeys = true
    prettyPrint = true
}

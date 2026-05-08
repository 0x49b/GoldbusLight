# Findings and Implementation Plan: GoldbusLight Port to Kotlin Multiplatform

## 1. Project Analysis (Current State)

The current **GoldbusLight** application is a Wails-based project (Go backend + React/TypeScript frontend) designed to control WLED devices, specifically optimized for deployment on a Raspberry Pi.

### Core Backend Functionality (Go):
- **mDNS/Zeroconf Discovery**: Uses `github.com/grandcat/zeroconf` and `github.com/hashicorp/mdns` to find WLED devices on the local network.
- **WLED Integration**: Communicates with WLED devices via their JSON HTTP API (`/json`, `/json/state`, `/json/cfg`).
- **Network Management**: Manages Linux Wi-Fi Access Point settings using `nmcli` (NetworkManager CLI).
- **Persistence**: Saves application settings and device lists to JSON files in the user's config directory.
- **State Management**: A central `WLEDController` manages device states, discovery loops, and health checks, emitting snapshots to the frontend.

### Core Frontend Functionality (React):
- **AppShell**: Navigation and status bar.
- **General Panel**: Global controls for all online WLED devices (presets, brightness, color, effects).
- **Device Detail View**: Granular control over a single device, including segment control, effects, and palettes.
- **Settings View**: Configuration for Access Point, Discovery, and Provisioning.

---

## 2. Kotlin Multiplatform (KMP) Implementation Plan

### 2.1 Technology Stack
- **UI Framework**: Compose Multiplatform (Desktop)
- **UI Component Library**: [compose-fluent-ui](https://github.com/compose-fluent/compose-fluent-ui) (for Microsoft Fluent Design)
- **HTTP Client**: Ktor (with ContentNegotiation and JSON)
- **mDNS Discovery**: [jMDNS](https://github.com/jmdns/jmdns)
- **Serialization**: kotlinx.serialization (JSON)
- **State Management**: Kotlin Coroutines & Flow (StateFlow)
- **Dependency Injection**: Koin
- **Build Tool**: Gradle (with KMP and Compose plugins)

### 2.2 Project Structure
```text
GoldbusLightKMP/
├── composeApp/                # Compose Multiplatform code
│   ├── commonMain/            # Shared UI logic, ViewModels, Domain models
│   │   ├── components/        # Reusable Fluent UI components
│   │   ├── screens/           # Main screens (General, DeviceDetail, Settings)
│   │   ├── viewmodel/         # State management using StateFlow
│   │   └── model/             # WLED and App data classes
│   └── desktopMain/           # Desktop-specific implementation (JVM)
│       ├── main.kt            # Application entry point
│       └── services/          # JVM implementations (Discovery, Network)
├── shared/                    # Non-UI shared logic (optional, can be in commonMain)
│   └── data/                  # Repositories, API clients, Persistence
└── build.gradle.kts           # KMP and Compose configuration
```

### 2.3 Implementation Steps

#### Phase 1: Infrastructure & Data Layer
1.  **Project Initialization**: Setup KMP project targeting Desktop (JVM).
2.  **Models**: Port `WLEDDevice`, `ControllerSettings`, and `GeneralTabState` Go structs to Kotlin `@Serializable` data classes.
3.  **HTTP Client**: Implement `WLEDHttpClient` using Ktor to handle JSON API calls to WLED.
4.  **mDNS Service**: Implement `DiscoveryService` using `jMDNS` to replicate the Go `DiscoveryEngine` logic.
5.  **Persistence**: Implement a `SettingsRepository` using `kotlinx.serialization` to read/write JSON files in `~/.config/goldbus-light/`.
6.  **Network Manager**: Implement `LinuxNetworkManager` (on `desktopMain`) that executes `nmcli` commands via `java.lang.ProcessBuilder`.

#### Phase 2: Domain & ViewModels
1.  **Controller Service**: Create a central service to orchestrate discovery, health checks, and state updates.
2.  **ViewModels**:
    *   `MainViewModel`: Manages the overall app state and navigation.
    *   `DeviceViewModel`: Handles interaction with specific WLED devices.
    *   `SettingsViewModel`: Handles configuration updates.

#### Phase 3: UI Development (compose-fluent-ui)
1.  **Main Window**: Setup `Window` with Fluent UI `FluentTheme`.
2.  **AppShell**: Use `NavigationView` for side navigation (Presets, Devices, Settings).
3.  **General Panel**: Recreate the global control dashboard using Fluent `Slider`, `Button`, and custom color pickers.
4.  **Device Detail**: Create a detailed view with list-based effect/palette pickers.
5.  **Settings**: Create forms for AP and Discovery settings using Fluent UI controls.

#### Phase 4: Raspberry Pi Optimization & Deployment
1.  **Hardware Acceleration**: Configure JVM arguments for Skia (Compose Desktop engine) to utilize Raspberry Pi 5's GPU (Mesa/V3D).
2.  **Fullscreen**: Implement fullscreen logic using `WindowPlacement.Fullscreen` based on an environment variable or setting.
3.  **Packaging**: Use `jpackage` (via the Compose Gradle plugin) to create a bundled runtime and executable for Linux ARM64.
4.  **Systemd Integration**: Port the existing `goldbuslight.service` and install scripts to work with the new JVM binary.

---

## 3. Key Considerations for Raspberry Pi 5

- **JVM Choice**: Use a 64-bit OpenJDK (e.g., Liberica JDK or BellSoft) with full support for Linux ARM64.
- **Compose Performance**: Ensure `skiko` (Compose's rendering layer) is correctly using OpenGL/Vulkan for smooth UI performance on the Pi 5.
- **Resource Management**: Properly manage Coroutine scopes for discovery and health check loops to avoid CPU spikes.
- **Interface Interaction**: Ensure the user running the JVM has permissions to execute `nmcli` (may require `sudo` or specific polkit rules).

---

## 4. UI Library Integration (compose-fluent-ui)

The migration will leverage `compose-fluent-ui` to provide a modern, polished look:
- **Navigation**: `NavigationView` will replace the React-based sidebar.
- **Theming**: Integrated Dark/Light mode support.
- **Controls**: Standardized `FluentButton`, `FluentSlider`, and `FluentCheckBox` for a consistent UX.

# **System Architecture Document: WLED Central Controller**

## **1\. Overview**

The WLED Central Controller is a standalone, touch-optimized kiosk application designed to orchestrate and manage multiple WLED devices. Running on a Raspberry Pi 5, the application acts as the network hub (Access Point), automatically discovers new WLED devices via mDNS, provisions them with initial configurations, remembers device state across reboots, and provides a centralized UI for lighting control including global presets. Additionally, the controller operates in a dual-network mode, bridging an external internet-connected Wi-Fi network to the local WLED sub-network. This enables Over-The-Air (OTA) updates for the WLED devices, the Raspberry Pi OS, and the controller application itself.

## **2\. Hardware Specifications**

* **Host Device:** Raspberry Pi 5  
* **Display:** Official Raspberry Pi 7-inch Touch Display  
* **Client Devices:** ESP8266/ESP32 microcontrollers running WLED firmware  
* **Networking:** Built-in Wi-Fi operating in concurrent AP+STA mode, or utilizing a secondary USB Wi-Fi adapter for dedicated upstream internet connection.

## **3\. Technology Stack**

The application utilizes the **Wails** framework, providing a lightweight, single-binary application that leverages Go for system-level/backend tasks and web technologies for the graphical interface.

* **Application Framework:** Wails v3  
* **Backend (Core Logic):** Golang (Go)  
* **Frontend (UI):** TypeScript, React, Vite  
* **UI Components:** daisyUI + Tailwind CSS  
* **Operating System:** Raspberry Pi OS Bookworm (Wayland compositor)  
* **Web Engine Rendering:** WebKitGTK (native Linux web view used by Wails)

## **4\. System Architecture & Core Modules**

### **4.1 Backend (Golang)**

The Go backend acts as the bridge between the operating system, the WLED devices, and the user interface.

* **Network & Access Point Manager:** Executes shell commands to OS network utilities (e.g., nmcli / NetworkManager) to manage a dual-network state. It broadcasts the dedicated Wi-Fi Access Point (e.g., WLED-Controller-Net) for WLED devices to connect to, while simultaneously connecting to a secondary external Wi-Fi network for internet access. It sets up IP forwarding/NAT to bridge internet access to the WLED devices. Handles UI requests to change both AP settings and upstream Wi-Fi credentials.  
* **Discovery Engine (mDNS/Zeroconf):** Utilizes a Go library to listen continuously for \_http.\_tcp or \_wled.\_tcp mDNS broadcasts on the local network. Listens to new devices and adds them dynamically to the UI.  
* **State Persistence Manager:** Saves the known WLED devices' states (IP addresses, names) to a local JSON file (\~/.config/wled-controller/state.json).  
  * On boot, checks the already known devices for connection and loads their configuration.  
  * Checks every 30 seconds if all known devices are still there and persists their state.  
* **WLED Provisioning & Control Engine:** Manages HTTP requests to the WLED JSON API.  
  * **Provisioning:** Upon new device discovery, sends a GET /json/cfg request to assess settings. It sends a POST /json/cfg payload to provision the device instantly if needed.  
  * **Control:** Translates UI slider movements into POST /json/state payloads and dispatches them to specific devices or globally.  
  * **Preset Orchestration:** Coordinates concurrent POST requests using Go Goroutines and sync.WaitGroup to change states on multiple devices simultaneously without a popcorning effect.  
* **Wails IPC Interface:** Exposes Go methods (Bindings) to the React frontend and pushes real-time events to the UI.

### **4.2 Frontend (TypeScript & React)**

The frontend is a strictly local Single Page Application (SPA) communicating with the Go backend via Wails' Inter-Process Communication (IPC).

* **Device List & State Management:** Listens to Wails events to dynamically populate the UI with available and remembered WLED devices.  
* **Touch Interface:** Features large, touch-friendly UI elements, focusing on drag-optimized slider primitives.  
* **Preset Management UI:** Provides quick-action buttons for global presets (e.g., Warm White, Full White, Party Mode). Allows users to configure a custom look across devices and click "Save as New Preset," sending the unified configuration to the backend to be stored.  
* **Network Settings View:** A dedicated settings panel allowing users to define the local Wi-Fi AP credentials *and* scan/connect to external Wi-Fi networks to provide the system with internet access.

## **5\. Network & Data Flow**

1. **Boot Phase:** RPi 5 powers on → OS initializes → Wails single binary auto-starts via systemd.  
2. **Network Initialization (AP & Bridge):** The Go backend checks NetworkManager, ensures the local AP is broadcasting, and attempts to connect to the saved upstream internet Wi-Fi. IP forwarding is initialized.  
3. **Persistence Load:** Go backend reads state.json → pings known devices → instantly sends active device list to frontend.  
4. **Discovery Phase:** The mDNS listener starts running in a Goroutine.  
5. **Client Connection:** A WLED device powers on, connects to the AP, and broadcasts its mDNS signature. It gains internet access through the RPi's bridged network for potential OTA updates.  
6. **Provisioning Phase:** Go backend intercepts the mDNS broadcast → fetches WLED config → updates WLED config if necessary → updates state.json → emits event to Frontend.  
7. **Control & Preset Phase:** User selects a preset (e.g., "Party Mode") on the touch screen → React state updates → Wails IPC calls Go function → Go fires concurrent HTTP POST requests to all known WLED devices → Lights change simultaneously. User can adjust and save new presets from the UI.

## **6\. Deployment & Autostart (Kiosk Mode)**

* **Compilation:** The Wails application is compiled into a single executable binary targeting linux/arm64.  
* **Autostart Configuration:** A systemd service is utilized to launch the Wayland compositor configured to load the Wails binary directly in full-screen, frameless mode.

`[Unit]`  
`Description=WLED Central Controller Kiosk`  
`After=network.target network-online.target`

`[Service]`  
`Environment=DISPLAY=:0`  
`Environment=WAYLAND_DISPLAY=wayland-1`  
`ExecStart=/usr/local/bin/wled-controller`  
`Restart=always`  
`User=pi`

`[Install]`  
`WantedBy=multi-user.target`  

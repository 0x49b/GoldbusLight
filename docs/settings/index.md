# Settings overview

Open **Sidebar → Settings**. Settings are grouped into tabs and save automatically (debounced ~2 seconds after edits, or immediately for toggles).

## Tabs

| Tab | Contents |
|-----|----------|
| **General** | Version, configuration backup, network apply results |
| **WLED** | Component toggle, refresh, access point, provisioning, ignored devices |
| **DMX** | Component toggle, simulators, global USB transport, per-universe USB/Art-Net, channel sweep test |
| **Console** | Transport log (hidden while console is detached) |

## Footer metadata

At the bottom of Settings:

- **Persistence path** — where configuration is stored on disk
- **Network backend** — platform network control availability
- **Host CLI** — e.g. `nmcli` on Linux for access point apply

## Detailed guides

- [Backup & restore](backup-restore.md)
- [Network & access point](network.md)
- [Transport console](console.md)

## Component toggles

### WLED

**Enable WLED component** — master switch for all WLED features. Turning off:

- Disables WLED sidebar sections and device actions
- Forces access point off

### DMX

**Enable DMX component** — master switch for DMX. Turning off:

- Hides DMX sidebar sections
- Disconnects live USB/Art-Net output

## Per-universe interfaces

Each configured DMX universe has an interface card (e.g. **Universe 1 interface**):

| Control | Description |
|---------|-------------|
| **USB device** | Select adapter for this universe (`No device selected` if none) |
| **Enable Art-Net for {universe}** | UDP output for this universe |
| Target host / broadcast | Default `255.255.255.255` |
| UDP port | Default `6454` |
| Net (0–127) / Subnet (0–15) / Art-Net universe (0–15) | Art-Net addressing |
| Refresh Hz | Default `44` |

Global **Enable USB transport (all universes)** must be on for USB output on any universe.

## DMX testing simulators

| Toggle | Effect |
|--------|--------|
| **Simulate USB-DMX512 interface** | In-process fake USB worker |
| **Simulate Art-Net interface** | In-process fake Art-Net worker |

Use for development without hardware. Disable before connecting real fixtures.

## DMX fixture channel sweep

Test tool to identify which physical channel maps to which DMX address.

**Workflow:**

1. Stop party mode
2. Select a fixture
3. Set sweep speed (1–100%)
4. Click **Start sweep** — universe blackouts, then each channel sweeps 0→255
5. Press **Space** to pause and log the current address/value
6. Click **Stop** to end and blackout

Shows summary of active USB/Art-Net transports.

## Application version

**General** tab shows the running version.

| Platform | Update method |
|----------|---------------|
| **Desktop** (Linux, macOS, Windows) | **Check for updates** — built-in updater downloads and installs newer releases |
| **Raspberry Pi** (`/opt/goldbuslight` install) | Shell only — in-app updater is disabled |

```bash
sudo ./scripts/goldbuslight-pi.sh update --latest
```

See [Raspberry Pi installation](../installation/raspberry-pi.md) for install, boot autostart (`--boot`), and recovery (`fix`).

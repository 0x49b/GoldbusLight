# Settings overview

Open **Sidebar → Settings**. Settings are grouped into tabs and save automatically (debounced ~2 seconds after edits, or immediately for toggles).

## Tabs

| Tab | Contents |
|-----|----------|
| **General** | Appearance, language, window display, phone companion, configuration backup, network apply results |
| **WLED** | Component toggle, refresh, access point, provisioning, ignored devices |
| **DMX** | Component toggle, simulators, global USB transport, USB/Art-Net interface, channel sweep test |
| **Party** | Party mode controls (visible when WLED or DMX is enabled) — see [Party mode](../party-mode/index.md) |
| **Console** | Transport log with filters and search (hidden while console is detached) |

## General tab

### Appearance

| Setting | Options |
|---------|---------|
| **Color mode** | **System**, **Light**, **Dark** |

### Language

| Setting | Options |
|---------|---------|
| **Language** | **System**, **English**, **Deutsch** |

### Window display

Desktop shells that support it show:

| Control | Action |
|---------|--------|
| **Enter fullscreen** / **Exit fullscreen** | Toggle fullscreen |
| **Maximize window** / **Restore window** | Maximize or restore the window |

On Raspberry Pi you can also start fullscreen with `GOLDBUS_FULLSCREEN=1` — see [Raspberry Pi installation](../installation/raspberry-pi.md).

### Phone companion

**Enable companion** and set **Port** (default `8765`). See [Phone companion](../companion/index.md).

### Configuration backup

**Export backup** / **Import backup** — see [Backup & restore](backup-restore.md).

## Footer metadata

At the bottom of Settings:

- **Persistence path** — where configuration is stored on disk
- **Network backend** — platform network control availability
- **Host CLI** — e.g. `nmcli` on Linux for access point apply

## Detailed guides

- [Backup & restore](backup-restore.md)
- [Network & access point](network.md)
- [Transport console](console.md)
- [Party mode](../party-mode/index.md)
- [Phone companion](../companion/index.md)

## Component toggles

### WLED

**Enable WLED component** — master switch for all WLED features. Turning off:

- Disables WLED sidebar sections and device actions
- Forces access point off

### DMX

**Enable DMX component** — master switch for DMX. Turning off:

- Hides DMX sidebar sections
- Disconnects live USB/Art-Net output

## DMX interface

| Control | Description |
|---------|-------------|
| **USB device** | Select adapter (`No device selected` if none) |
| **Enable Art-Net** | UDP Art-Net output |
| Target host / broadcast | Default `255.255.255.255` |
| UDP port | Default `6454` |
| Net (0–127) / Subnet (0–15) / Art-Net universe (0–15) | Art-Net addressing |
| Refresh Hz | Default `44` |

Global **Enable USB transport** must be on for USB output.

## DMX testing simulators

| Toggle | Effect |
|--------|--------|
| **Simulate USB-DMX512 interface** | In-process fake USB worker |
| **Simulate Art-Net interface** | In-process fake Art-Net worker |

Use for development without hardware. Disable before connecting real fixtures.

## DMX fixture channel sweep

Test tool to identify which physical channel maps to which DMX address.

**Workflow:**

1. Stop party mode (**Settings → Party → Stop Party**)
2. Select a fixture
3. Set sweep speed (1–100%)
4. Click **Start sweep** — universe blackouts, then each channel sweeps 0→255
5. Press **Space** to pause and log the current address/value
6. Click **Stop** to end and blackout

Shows summary of active USB/Art-Net transports.

## Application updates

| Platform | Update method |
|----------|---------------|
| **Raspberry Pi** (`/opt/goldbuslight` install) | Shell only — in-app updater is disabled |
| **Desktop** (Linux, macOS, Windows) | Download a newer binary from [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases), or follow release notes for your platform |

```bash
sudo ./scripts/goldbuslight-pi.sh update --latest
```

See [Raspberry Pi installation](../installation/raspberry-pi.md) for install, boot autostart (`--boot`), and recovery (`fix`).

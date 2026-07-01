# Settings overview

Open **Sidebar → Settings**. Settings are grouped into tabs and save automatically (debounced ~2 seconds after edits, or immediately for toggles).

## Tabs

| Tab | Contents |
|-----|----------|
| **General** | Version, license, configuration backup, network apply results |
| **WLED** | Component toggle, discover/refresh, access point, discovery/provisioning, ignored devices |
| **DMX** | Component toggle, simulators, USB, Art-Net, channel sweep test |
| **Console** | Transport log (hidden while console is detached) |

## Footer metadata

At the bottom of Settings:

- **Persistence path** — where configuration is stored on disk
- **Network backend** — platform network control availability
- **Host CLI** — e.g. `nmcli` on Linux for access point apply

## Detailed guides

- [Backup & restore](backup-restore.md)
- [License & editions](license.md)
- [Network & access point](network.md)
- [Transport console](console.md)

## Component toggles

### WLED

**Enable WLED component** — master switch for all WLED features. Turning off:

- Hides WLED sidebar sections
- Disables discovery and device actions
- Forces access point off

### DMX

**Enable DMX component** — master switch for DMX. Turning off:

- Hides DMX sidebar sections
- Disconnects live USB/Art-Net output

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

**General** tab shows the running version. On Raspberry Pi, updates are installed from the shell:

```bash
sudo ./scripts/install-release.sh <tag>
```

The in-app UI does not download updates itself on Pi deployments.

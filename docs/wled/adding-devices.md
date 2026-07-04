# Adding WLED devices & provisioning

WLED devices are added **manually by IP address**. There is no automatic mDNS discovery in the current application — you enter the device’s IPv4 address and the controller verifies it over HTTP before saving.

## Add a device

1. In the sidebar under **WLED → Devices**, click **+** (tooltip: **Add WLED device**).
2. Enter the **IPv4 address** (for example `192.168.1.42`).
3. Enter **Port** if not the default `80`.
4. Click **Add device**.

The controller health-checks the device via HTTP. On success, you are taken to the device page and the device appears in the sidebar.

If the add fails, the page shows: *Could not add device. Check the IP address and that WLED is reachable on the network.*

Click **Cancel** to return to **General**.

!!! tip "Finding the IP address"
    Use your router’s DHCP client list, the WLED mobile app, or the device’s own display if it shows network info. The controller does not scan the network for you.

## Refresh device list

**Settings → WLED → Refresh** pulls the latest controller snapshot (devices, online state, settings). Use this after network changes or when a device should have come back online.

The status line in the sidebar header also updates from background polling (about every 30 seconds).

## Offline devices in the sidebar

Offline devices appear **grayed out** and cannot be opened with a single click.

| Action | Effect |
|--------|--------|
| **Double-click** or **double-tap** offline entry | Triggers a refresh attempt for that device |
| **Settings → WLED → Refresh** | Refreshes all device online state |

Tooltip on offline entries: *Offline — double-click or double-tap to refresh*

## Provisioning

Provisioning applies default configuration and state when a device is **added** (not on a separate button).

**Settings → WLED → Provisioning**

| Setting | Description |
|---------|-------------|
| **Auto-provision newly added devices** | After a successful add: fetch config, apply patch, apply state, mark device provisioned |
| **Default /json/state payload** | JSON sent to `POST /json/state` for new devices (default `{"on": true, "bri": 180}`) |
| **Default /json/cfg patch** | JSON patch sent to `POST /json/cfg` (default `{}`) |

### Provisioning sequence

When auto-provision runs after adding a device:

1. `GET /json/cfg` — inspect current device configuration
2. Optional `POST /json/cfg` — apply your default config patch
3. `POST /json/state` — apply your default state payload
4. Device marked `provisioned: true` in the controller

!!! note
    There is no **Provision** button on the device page. Enable **Auto-provision newly added devices**, or provision via the controller API.

## Ignored devices

**Settings → WLED → Ignored devices** lists devices you chose to hide.

- **Ignore** on a device page removes it from sidebar and General presets (confirm dialog: **Ignore device?**)
- **Un-ignore** in Settings restores the device to lists

Ignored devices remain in the persisted configuration until deleted.

## Simulate WLED device

**Simulate WLED device (testing)** adds a fake `sim:wled` entry for development without network hardware. Disable before production use.

## Troubleshooting

| Problem | Things to try |
|---------|----------------|
| Cannot add device | Ping the IP from the controller host; open the WLED web UI in a browser; confirm port (usually 80) |
| Device stays offline | Power-cycle WLED; double-tap the sidebar entry; **Settings → WLED → Refresh** |
| Wrong IP after DHCP change | Delete the old entry and add the device again with the new IP |
| Device offline in sidebar | Cannot open device page until online — use refresh actions above |

See also [Troubleshooting](../troubleshooting.md).

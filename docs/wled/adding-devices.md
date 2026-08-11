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

## Finding the IP address

Goldbus Light does **not** scan the network or list DHCP clients. You must learn each device’s IPv4 address outside the app, then enter it when adding the device.

### On a normal LAN (home/venue router)

Use any of these:

| Method | How |
|--------|-----|
| **Router DHCP client list** | Open your router’s admin UI and find the WLED device (hostname often contains `wled`) |
| **WLED mobile app** | Connect the phone to the same Wi‑Fi; the app shows discovered controllers and their IPs |
| **Device display / WLED UI** | Some controllers show the assigned IP on a display or in the WLED web UI under network info |

### On the controller access point (Raspberry Pi hotspot)

When you enable **Settings → WLED → Access point** on Linux with NetworkManager (`ipv4.method=shared`), the Pi is typically the gateway at **`10.42.0.1`**, and WLED clients receive addresses in **`10.42.0.0/24`** (for example `10.42.0.12`).

After the WLED device joins the AP SSID, find its IP with one of these methods:

| Method | How |
|--------|-----|
| **WLED mobile app or device display** | Join the phone (or check the controller display) on the same AP; read the assigned IPv4 from WLED’s network info |
| **Browser on a phone on the AP** | Open `http://<candidate-ip>/` for addresses in `10.42.0.x`. A successful page load shows the WLED web UI |
| **Neighbor table on the Pi** | On the Raspberry Pi (SSH or terminal), run `ip neigh` and look for a new `10.42.0.x` entry after the device connects |
| **DHCP / NetworkManager leases** | On the Pi, inspect NetworkManager or dnsmasq lease information for the shared AP connection; note the IPv4 leased to the WLED MAC/hostname |
| **Ping or try common addresses** | From the Pi, ping addresses in `10.42.0.0/24` (or try likely hosts such as `10.42.0.2` … `10.42.0.50`), then open `http://<ip>/` in a browser to confirm WLED |

!!! note "WLED’s own AP vs the controller AP"
    WLED’s factory access point often uses **`4.3.2.1`**. That address applies only while the device is still in **its own** AP mode. After WLED joins the Goldbus Light hotspot as a client, use the leased `10.42.0.x` address instead.

See [Network & access point](../settings/network.md) for enabling and applying the AP.

### After DHCP changes the address

If the WLED IP changes later, delete the old device entry and [add it again](#add-a-device) with the new IPv4.

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
| Do not know the IP (LAN or AP) | Follow [Finding the IP address](#finding-the-ip-address) |
| Device stays offline | Power-cycle WLED; double-tap the sidebar entry; **Settings → WLED → Refresh** |
| Wrong IP after DHCP change | Delete the old entry and add the device again with the new IP |
| Device offline in sidebar | Cannot open device page until online — use refresh actions above |

See also [Troubleshooting](../troubleshooting.md).

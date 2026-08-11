# WLED overview

The **WLED** component controls [WLED](https://kno.wled.ge/) LED controllers on your local network. You add devices by IP address, then operate them individually or apply **General** presets to all devices at once.

## Prerequisites

1. **Settings → WLED** — enable **Enable WLED component**
2. WLED devices reachable on the LAN from the controller host (HTTP on the configured port, usually 80)
3. Know each device’s **IPv4 address** — see [Finding the IP address](adding-devices.md#finding-the-ip-address) (including the Raspberry Pi access point / hotspot). For AP setup, see [Network & access point](../settings/network.md)

## Main areas

| Area | Path | Purpose |
|------|------|---------|
| [Adding devices & provisioning](adding-devices.md) | Sidebar **+** on Devices; Settings → WLED | Add by IP, auto-provision, ignored list |
| [Device control](devices.md) | Sidebar → Devices → *name* | Per-device power, color, effects, segments |
| [General presets](general-presets.md) | Sidebar → General | All-device color, brightness, effects |

## Device states

Each WLED device in the sidebar has a status:

| State | Sidebar | Meaning |
|-------|---------|---------|
| Online | Normal, clickable | Device responded to recent queries |
| Offline | Grayed out; double-tap to refresh | No recent response |
| Ignored | Hidden from sidebar lists | Still in config; restore via Settings → Ignored devices |
| In party | Green dot during party | Device is a party target |

## WLED and access point

The **local access point** feature (Settings → WLED → Access point) is tied to the WLED component. Disabling WLED forces the access point off. See [Network & access point](../settings/network.md). After a WLED device joins the AP, use [Finding the IP address](adding-devices.md#finding-the-ip-address) to learn the leased `10.42.0.x` address before adding the device.

## WLED in party mode

Select WLED devices as targets on the [Party](../party-mode/index.md) page. Only **online, non-ignored** devices appear in the party target list.

## Testing without hardware

Enable **Simulate WLED device (testing)** in **Settings → WLED → Provisioning**. This adds an in-app fake device (`sim:wled`) with no network traffic, useful for UI testing.

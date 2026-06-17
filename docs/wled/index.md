# WLED overview

The **WLED** component discovers and controls [WLED](https://kno.wled.ge/) LED controllers on your local network. You can operate devices individually or apply **General** presets to all devices at once.

## Prerequisites

1. **Settings → WLED** — enable **Enable WLED component**
2. WLED devices on the same LAN as the controller host
3. mDNS/Bonjour reachable between host and devices (typical on home/small venue networks)

## Main areas

| Area | Path | Purpose |
|------|------|---------|
| [Discovery & provisioning](discovery.md) | Settings → WLED | Find devices, auto-provision, ignored list |
| [Device control](devices.md) | Sidebar → Devices → *name* | Per-device power, color, effects, segments |
| [General presets](general-presets.md) | Sidebar → General | All-device color, brightness, effects |

## Device states

Each WLED device in the sidebar has a status:

| State | Sidebar | Meaning |
|-------|---------|---------|
| Online | Normal, clickable | Device responded to recent queries |
| Offline | Grayed out, not clickable | No recent response — run Discover or Refresh |
| Ignored | Hidden from sidebar lists | Still in config; restore via Settings → Ignored devices |
| In party | Green dot during party | Device is a party target |

## WLED and access point

The **local access point** feature (Settings → WLED → Access point) is tied to the WLED component. Disabling WLED forces the access point off. See [Network & access point](../settings/network.md).

## WLED in party mode

Select WLED devices as targets on the [Party](../party-mode/index.md) page. Only **online, non-ignored** devices appear in the party target list.

## Testing without hardware

Enable **Simulate WLED device (testing)** in Settings → WLED → Discovery & provisioning. This adds an in-app fake device (`sim:wled`) with no network traffic, useful for UI testing.

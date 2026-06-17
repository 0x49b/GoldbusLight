# WLED discovery & provisioning

WLED devices are found via **mDNS** (Bonjour). You can run continuous background discovery or trigger a one-shot scan.

## Settings location

**Settings → WLED** tab

## Discovery controls

| Control | Description |
|---------|-------------|
| **Discover** | One-shot mDNS scan; shows “Discovery running …” modal until complete |
| **Refresh** | Pulls latest controller snapshot from the backend (devices, settings, online state) |
| **Enable mDNS discovery loop** | Background rediscovery at the configured interval |

### Discovery parameters

| Setting | Default | Notes |
|---------|---------|-------|
| Interval (s) | 15 | Minimum 2 seconds between discovery passes |
| Query timeout (ms) | 2000 | Minimum 500 ms |
| Service types | (configured list) | Comma-separated mDNS service types |

Background discovery runs automatically when the loop is enabled. New devices appear in the sidebar as they are found.

## Provisioning

Provisioning applies default configuration and state to newly discovered WLED devices.

| Setting | Description |
|---------|-------------|
| **Auto-provision newly discovered devices** | On discovery: fetch config, apply patch, apply state, mark device provisioned |
| **Default /json/state payload** | JSON sent to `POST /json/state` for new devices |
| **Default /json/cfg patch** | JSON patch sent to `POST /json/cfg` |

### Provisioning sequence

When auto-provision runs:

1. `GET /json/cfg` — inspect current device configuration
2. Optional `POST /json/cfg` — apply your default config patch
3. `POST /json/state` — apply your default state payload
4. Device marked `provisioned: true` in the controller

!!! note
    There is no separate **Provision** button on the device page. Use auto-provision in Settings, or provision devices programmatically via the controller API.

## Ignored devices

**Settings → WLED → Ignored devices** lists devices you chose to hide.

- **Ignore** on a device page removes it from sidebar and General presets
- **Un-ignore** in Settings restores the device to lists

Ignored devices remain in the persisted configuration until deleted.

## Simulate WLED device

**Simulate WLED device (testing)** adds a fake `sim:wled` entry for development without network hardware. Disable before production use.

## Troubleshooting discovery

| Problem | Things to try |
|---------|----------------|
| No devices found | Confirm WLED and controller on same subnet; check firewall blocks mDNS (UDP 5353) |
| Device stays offline | Power-cycle WLED; click **Refresh**; verify IP in router DHCP list |
| Device offline in sidebar | Offline entries cannot be opened until online again — use Discover/Refresh |

See also [Troubleshooting](../troubleshooting.md).

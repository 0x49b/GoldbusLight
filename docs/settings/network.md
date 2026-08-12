# Network & access point

Goldbus Light Controller can configure a **local Wi-Fi access point** on Linux hosts with NetworkManager. This is useful for provisioning WLED devices on a dedicated controller network.

## Location

**Settings → WLED → Access point**

Requires **Enable WLED component** to be on.

## Access point fields

| Field | Description |
|-------|-------------|
| **Enable local access point** | Master toggle |
| **AP connection name** | NetworkManager connection profile name |
| **AP interface** | Wireless interface (e.g. `wlan0`) |
| **AP SSID** | Network name broadcast to clients |
| **AP password** | WPA passphrase |
| **Channel** | Wi-Fi channel number |

## Persistence & startup

Access point settings are saved with the rest of controller settings (`state.json`) whenever you change them. On app start, the controller loads those settings and — if the AP was left **enabled** — applies them to the host automatically (Linux / NetworkManager).

## Enable, disable, and apply

| Action | What happens |
|--------|----------------|
| **Enable local access point** | Confirmation dialog, then save and apply (brings the AP up on Linux) |
| **Disable local access point** | Confirmation dialog, then save and apply (brings the connection down on Linux) |
| **Edit fields while AP is on** | Leaving a changed field asks for confirmation before saving and applying to the live network |

Results appear under **Settings → General → Network apply result** with step-by-step command output.

## Dry-run behavior

If the network CLI is unavailable (wrong OS or missing `nmcli`), apply runs as a **dry-run** and shows warnings instead of changing the system.

Capabilities are shown in the Settings footer (network backend label, CLI availability).

## Disabling WLED

Turning off **Enable WLED component** forces the access point off in settings.

## Linux requirement

Install NetworkManager:

```bash
# Debian/Ubuntu
sudo apt-get install -y network-manager

# Fedora
sudo dnf install -y NetworkManager
```

## Security notes

- Use a strong AP password for production deployments
- The access point exposes a Wi-Fi network; place controller hardware physically secure
- Party and DMX features do not require AP — it is optional for WLED provisioning workflows
- If you enable the [phone companion](../companion/index.md), phones on this AP can open `http://10.42.0.1:<port>/` and steer DMX/WLED — treat the AP password as access control for lighting

## Troubleshooting

| Issue | Check |
|-------|-------|
| Apply fails | Settings footer for `nmcli` availability; run apply again and read **Network apply result** |
| AP does not broadcast | Verify interface name; check `nmcli device status` on the host |
| WLED devices not joining | Confirm WLED configured for your AP SSID/password separately |
| Joined AP but unknown IP | On the shared NetworkManager AP the Pi is usually `10.42.0.1`; use **Settings → WLED → Access point → IP neighbors** (Linux) or see [Finding the IP address](../wled/adding-devices.md#finding-the-ip-address) |

See [Troubleshooting](../troubleshooting.md).

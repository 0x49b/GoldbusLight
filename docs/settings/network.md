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

## Apply changes

| Button | Action |
|--------|--------|
| **Apply network settings** | Saves current fields (if needed) and runs network backend commands (NetworkManager `nmcli` on Linux) |
| **Disable AP now (save + apply)** | Turns AP off, saves, and applies immediately (brings the connection down on Linux) |

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

## Troubleshooting

| Issue | Check |
|-------|-------|
| Apply fails | Settings footer for `nmcli` availability; run apply again and read **Network apply result** |
| AP does not broadcast | Verify interface name; check `nmcli device status` on the host |
| WLED devices not joining | Confirm WLED configured for your AP SSID/password separately |

See [Troubleshooting](../troubleshooting.md).

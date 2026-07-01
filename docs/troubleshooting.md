# Troubleshooting

Common issues and fixes for Goldbus Light Controller.

## WLED discovery

### No devices appear

1. Confirm **Settings → WLED → Enable WLED component** is on
2. Click **Discover** or enable **mDNS discovery loop**
3. Verify controller and WLED on the **same subnet**
4. Check firewall allows **mDNS** (UDP port 5353)
5. Power-cycle the WLED device

### Device stuck offline

1. **Settings → WLED → Refresh**
2. Ping the device IP from the controller host
3. Open the WLED web UI in a browser to confirm it is alive
4. Sidebar offline devices cannot be opened until online again

### Ignored device missing from sidebar

**Settings → WLED → Ignored devices → Un-ignore**

## DMX output

### No DMX output

1. **Settings → DMX → Enable DMX component**
2. USB: enable **Enable USB transport (all universes)**, select adapter on each **{Universe name} interface** card, click **Refresh USB devices**
3. Art-Net: enable **Enable Art-Net for {universe}**, verify target IP and Art-Net universe
4. **Universe → DMX Output - ON**
5. Check **Transport console** for write errors

### USB device not listed

1. Plug adapter in before or refresh after plugging in
2. Linux: user in `dialout` group for `/dev/ttyUSB*` or `/dev/ttyACM*`
3. Confirm adapter is Enttec Pro–compatible

### Wrong channel moves wrong parameter

Use **Settings → DMX → channel sweep** to step through channels and note mappings. Adjust fixture channel types/offsets in **Editor**.

### Address conflicts

**Universe** view shows red warnings on overlapping fixtures. Drag fixtures to free addresses or edit start addresses in **Editor**.

## Party mode

### Start Party disabled

Select at least one WLED or DMX target.

### Manual live controls do nothing

Party mode blocks manual patches. **Stop Party** first.

### Audio mode — no signal

1. **Refresh devices** on Party page
2. Reselect audio input (Linux uses PulseAudio source names)
3. Install `pipewire-utils` and `pulseaudio-utils` on Linux
4. Verify `pactl get-default-source` and `pw-record --version`

### Party audio issues

| Platform | Fix |
|----------|-----|
| Linux | `sudo apt-get install -y pipewire pipewire-pulseaudio pipewire-utils pulseaudio-utils` |
| Linux | Reselect input after install — device IDs differ from other OSes |
| macOS / Windows | Grant microphone permission to the app in OS settings |

### Smoke bursts not running

- Ensure smoke/hazer fixture type is configured
- **Burst volume** must be &gt; 0 for automatic atmosphere fixtures
- Check fixture fog/channel mapping in Editor

## Raspberry Pi

### App does not start on boot

1. Enable user service: `systemctl --user enable goldbuslight.service`
2. Enable desktop auto-login
3. Check logs: `journalctl --user -u goldbuslight.service -f`

### Fullscreen display glitches

Set `GOLDBUS_FULLSCREEN=0` in `/etc/default/goldbuslight` to test windowed mode. Restart session if WebKit compositor glitches on startup.

### Update failed

```bash
sudo ./scripts/install-release.sh v<tag>
```

Verify tag exists on [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases). Roll back with `GoldbusLight.previous` — see [Raspberry Pi installation](installation/raspberry-pi.md#rolling-back).

## Network / access point

### Apply network settings does nothing

Check **Settings → General → Network apply result** for dry-run message. Install NetworkManager (`nmcli`) on Linux.

## Application logs

Override log file location:

```bash
export GOLDBUS_LOG_FILE=/tmp/goldbuslight.log
./GoldbusLight
```

## Blackout (emergency recovery)

**Blackout** stops party, blackouts DMX, and stops live output.

If the UI is unresponsive, stop the process or service:

```bash
systemctl --user stop goldbuslight.service   # Pi user service
```

## Getting help

- [GitHub Issues](https://github.com/0x49b/GoldbusLight/issues) — bug reports and feature requests
- [User manual home](index.md) — full documentation index
- [setup.md](https://github.com/0x49b/GoldbusLight/blob/master/setup.md) — developer setup and OS packages

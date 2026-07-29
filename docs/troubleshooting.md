# Troubleshooting

Common issues and fixes for Goldbus Light Controller.

## WLED devices

### No devices appear

1. Confirm **Settings → WLED → Enable WLED component** is on
2. Add devices with **Sidebar → Devices → +** and enter each **IPv4 address**
3. Verify controller and WLED on the **same subnet** (or routable network)
4. Power-cycle the WLED device if HTTP does not respond

### Device stuck offline

1. **Double-tap** the device in the sidebar, or **Settings → WLED → Refresh**
2. Ping the device IP from the controller host
3. Open the WLED web UI in a browser to confirm it is alive
4. Sidebar offline devices cannot be opened until online again — refresh first

### Ignored device missing from sidebar

**Settings → WLED → Ignored devices → Un-ignore**

## DMX output

### No DMX output

1. **Settings → DMX → Enable DMX component**
2. USB: enable **Enable USB transport**, select adapter under **DMX interface**, click **Refresh USB devices**
3. Art-Net: enable **Enable Art-Net**, verify target IP and Art-Net universe
4. Confirm the toolbar **DMX** badge is green (automatic when an interface is ready). If it stays rose, the interface is not attached, selected, or enabled
5. Check **Transport console** for write errors

### USB device not listed

1. Plug adapter in before or refresh after plugging in
2. Linux: user in `dialout` group for `/dev/ttyUSB*` or `/dev/ttyACM*`
3. Confirm adapter is Enttec Pro–compatible (or Open DMX / Cable). Check Settings → Console for `Enttec Pro` vs `Open DMX` after start.

### Enttec DMX USB Pro LED / exclusive access

Official LED behaviour ([ENTTEC user manual](https://support.enttec.com/user-manuals/dmx-usb-pro)):

| LED | Meaning |
|-----|---------|
| Blinks once on plug-in, then off | Power-on; idle until software sends DMX |
| Blinks continuously | DMX is actively being sent or received — expected while the **DMX** badge is green |
| Always off while output should be on | Host is not successfully driving the widget (wrong framing, port busy, or no stream) |
| Solid on (no blink) | Error mode — restore/reflash with [ENTTEC EMU](https://www.enttec.com/), then re-select the device here |

Also:

1. Close **EMU** (or any other app using the Pro) before starting Goldbus — the virtual COM port is exclusive
2. After an EMU DMX send test, quit EMU, then refresh/select the USB device in **Settings → DMX**
3. Console should log `USB DMX adapter started @ 40Hz (Enttec Pro, …)` for a Pro widget

### Wrong channel moves wrong parameter

Use **Settings → DMX → channel sweep** to step through channels and note mappings. Adjust fixture channel types/offsets in **Editor**.

### Address conflicts

**Universe** view shows red warnings on overlapping fixtures. Drag fixtures to free addresses or edit start addresses in **Editor**.

## Party mode

Open party controls from **Settings → Party**.

### Start Party disabled

Select at least one WLED, DMX, or smoke target on the **WLED**, **DMX**, or **Smoke** tabs.

### Manual live controls do nothing

Party mode blocks manual patches. **Stop Party** first.

### Audio mode — no signal

1. **Refresh devices** on **Settings → Party**
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
- Open the **Smoke** tab under **Settings → Party**
- **Burst volume** must be &gt; 0 for automatic atmosphere fixtures
- Check fixture fog/channel mapping in Editor

## Scenes

### Active badge disappeared

Manual WLED or DMX edits clear the active scene. Tap the scene card again to re-apply (no confirmation if it was already active).

### Party scene card does nothing

While party is already running, the party scene card is disabled. Stop party from **Settings → Party**, then tap the card again.

## Raspberry Pi

### App does not start on boot

1. Enable user service: `systemctl --user enable goldbuslight.service`
2. Enable desktop auto-login
3. Check logs: `journalctl --user -u goldbuslight.service -f`

### Fullscreen display glitches

Set `GOLDBUS_FULLSCREEN=0` in `/etc/default/goldbuslight` to test windowed mode. Restart session if WebKit compositor glitches on startup.

### Update failed

If the app vanished after a failed in-app update attempt, the Wails updater may have left only `GoldbusLight.bak` in `/opt/goldbuslight/`. Recover with:

```bash
sudo ./scripts/goldbuslight-pi.sh fix
```

Or restore manually:

```bash
sudo ./scripts/goldbuslight-pi.sh stop
sudo mv /opt/goldbuslight/GoldbusLight.bak /opt/goldbuslight/GoldbusLight
sudo chmod 0755 /opt/goldbuslight/GoldbusLight
sudo ./scripts/goldbuslight-pi.sh start
```

For normal upgrades, use the Pi manager script (not the in-app updater):

```bash
sudo ./scripts/goldbuslight-pi.sh update --latest
```

Verify tag exists on [GitHub Releases](https://github.com/0x49b/GoldbusLight/releases). Roll back with `sudo ./scripts/goldbuslight-pi.sh rollback` or see [Raspberry Pi installation](installation/raspberry-pi.md#rolling-back).

## Network / access point

### Apply network settings does nothing

Check **Settings → General → Network apply result** for dry-run message. Install NetworkManager (`nmcli`) on Linux.

### Access point not restored after reboot

Confirm **Enable local access point** is on and settings were saved (autosave or Apply). On Linux the app reapplies the AP shortly after startup when it was left enabled. Check application logs for `access point on boot` messages and `nmcli device status` on the host.

## Application logs

Override log file location:

```bash
export GOLDBUS_LOG_FILE=/tmp/goldbuslight.log
./GoldbusLight
```

## Blackout (emergency recovery)

**Blackout** stops party and sets all DMX channels to 0%. Live output keeps streaming those zeros until you raise levels again (Live controls, a scene, or party).

If the UI is unresponsive, stop the process or service:

```bash
systemctl --user stop goldbuslight.service   # Pi user service
```

## Getting help

- [GitHub Issues](https://github.com/0x49b/GoldbusLight/issues) — bug reports and feature requests
- [User manual home](index.md) — full documentation index
- [setup.md](https://github.com/0x49b/GoldbusLight/blob/master/setup.md) — developer setup and OS packages

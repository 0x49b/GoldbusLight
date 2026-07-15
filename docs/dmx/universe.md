# DMX universe view

**Sidebar → DMX → Universe** shows all 512 DMX channels and how fixtures occupy them.

## Header controls

The header shows the active interface summary (USB device name, Art-Net, or **No interface**).

| Control | Description |
|---------|-------------|
| **Add fixture** | Open the create-fixture page |
| **Blackout** | Stop party, blackout all DMX channels, stop live output |
| **DMX Output - ON/OFF** | Start or stop live DMX output |

### DMX Output ON

When you turn output **ON**:

- Live output starts on enabled transports (USB and/or Art-Net)
- All fixtures receive a “power on” patch (dimmer / lamp / onOff / shutterStrobe channels, or all channels to 255 as fallback)

### DMX Output OFF

When you turn output **OFF**:

- Fixtures receive a power-off patch
- Live output stops

## Universe grid

The grid displays channels **001–512**.

| Visual | Meaning |
|--------|---------|
| Gray channel numbers | Free slots (unused addresses) |
| Colored blocks | Fixture footprint spanning its channels |
| Red highlight | Address conflict (overlapping fixtures) |

Click a fixture block to open its editor. Drag fixtures to readdress; overlapping fixtures may be shifted forward to make room.

## Interface setup

USB device and Art-Net settings are under **Settings → DMX** (**DMX interface** card). Global **Enable USB transport** must be on for USB output. If no device is selected, the header shows **No interface**.

# DMX universe view

**Sidebar → DMX → Universe** shows all 512 DMX channels and how fixtures occupy them.

## Header controls

The header shows the active interface summary (USB device name, Art-Net, or **No interface**).

| Control | Description |
|---------|-------------|
| **Add fixture** | Open the create-fixture page |
| **Blackout** | Stop party mode and set all DMX channels to 0% (output keeps streaming) |
| **DMX** badge | Read-only — green when packets are being sent, rose when not |

!!! note "Automatic output"
    You do not toggle DMX output on or off. When DMX is enabled and a USB or Art-Net interface is selected and enabled, the app sends packets automatically. The **DMX** badge only shows the current state.

## Universe grid

The grid displays channels **001–512**.

| Visual | Meaning |
|--------|---------|
| Gray channel numbers | Free slots (unused addresses) |
| Colored blocks | Fixture footprint spanning its channels |
| Red highlight | Address conflict (overlapping fixtures) |

Click a fixture block to open its editor. Drag fixtures to readdress; overlapping fixtures may be shifted forward to make room.

## Interface setup

USB device and Art-Net settings are under **Settings → DMX** (**DMX interface** card). Global **Enable USB transport** must be on for USB output. If no device is selected, the header shows **No interface** and the **DMX** badge uses rose styling.

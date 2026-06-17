# DMX universe view

**Sidebar → DMX → Universe** shows all 512 DMX channels and how fixtures occupy them.

## Header controls

| Control | Description |
|---------|-------------|
| **Universe 1** badge | Logical universe identifier |
| USB subtitle | Selected USB device name, or “No USB device selected” |
| **In case of emergency** | Stop party, blackout, stop live output |
| **DMX Output — ON/OFF** | Start or stop live DMX output for all fixtures |

### DMX Output ON

When you turn output **ON**:

- Live output starts on enabled transports (USB and/or Art-Net)
- All fixtures receive a “power on” patch (dimmer / lamp / onOff / shutterStrobe channels, or all channels to 255 as fallback)

### DMX Output OFF

When you turn output **OFF**:

- Fixtures receive a power-off patch
- Live output stops

## Universe grid

The grid displays channels **001–512** in 32 columns.

| Visual | Meaning |
|--------|---------|
| Gray channel numbers | Free slots (unused addresses) |
| Colored blocks | Fixture footprint spanning its channels |
| Address + name on block | Fixture start address and label |
| Red border / warning | **Address conflict** — two fixtures overlap |
| Green border / “Live” | DMX live output active on that fixture |

## Drag-and-drop readdressing

Rearrange fixtures without opening the editor:

1. **Drag** a fixture block to a new start channel
2. A preview ring shows **blue** (valid) or **red** (not enough space)
3. **Drop** to commit — forward fixtures may shift to make room
4. **Double-click** a fixture block to open its detail page

!!! warning "Conflicts"
    Overlapping addresses are highlighted in red. Resolve conflicts before relying on live output in production.

## Relationship to Settings

USB device selection is in **Settings → DMX → DMX USB interface**, not on the Universe page. If no device is selected, the subtitle reminds you.

## Live status

The sidebar shows green dots on fixtures actively receiving live output when DMX is connected. During party mode, fixtures in the party target list also show green dots.

## Keyboard and touch

The universe view supports touch pan/scroll on touchscreen kiosks (e.g. Raspberry Pi with display).

# WLED device control

Open a device from **Sidebar → WLED → Devices → *device name***. Only **online** devices can be opened.

## Device header

| Element | Action |
|---------|--------|
| **Device name** | Click pencil to edit; **Save** / **Cancel** |
| **Address** | `host:port • device id` |
| **Connected / Unreachable** | Online status badge |
| **Power** | Toggle all segments on/off |
| **Reload** | Refresh device state (retries up to several times if unreachable) |
| **Ignore** | Hide device from sidebar and General page |
| **Delete** | Remove device from controller list |

## Segments

If the WLED device has multiple segments, a **segment selector** appears. Controls apply to the selected segment.

## Color & brightness

| Control | Range | Notes |
|---------|-------|-------|
| **Hue slider** | Color | Disabled when offline or power off |
| **Brightness** | 0–100% (step 5) | |
| **Warm white** | Preset | Applies warm white RGB |
| **Cold white** | Preset | Applies cold white RGB |
| **Color** dropdown | Named presets | Candle 1300K through Direct Sunlight |
| **Transition** | 0–255 (×100 ms) | Fade time for state changes |

Controls are locked when the device is offline or powered off.

## Effects & palette

| Control | Description |
|---------|-------------|
| **Effect** | Opens effect picker (index + human-readable name) |
| **Palette** | Opens palette picker |
| **Speed (sx)** | 0–255 |
| **Intensity (ix)** | 0–255 |

Changes to effect, palette, speed, and intensity apply to the selected segment automatically (throttled to avoid flooding the device).

## State & configuration (advanced)

Collapsible sections show raw JSON:

- Device info (`GET /json`)
- Configuration (`GET /json/cfg`)
- Current state
- Last persisted state snippet

Useful for debugging; most users do not need to edit these directly.

## Rename workflow

1. Click the pencil next to the device name
2. Edit the name in the text field
3. Click **Save** (or **Cancel** to discard)

The name is stored in the controller and used in the sidebar and party targets.

## Ignore vs delete

| Action | Effect |
|--------|--------|
| **Ignore** | Hides from UI; data kept; reversible in Settings |
| **Delete** | Removes from controller device list entirely |

## Party mode interaction

While party mode runs and includes this device, the device is driven by the party engine. Stop party mode to resume manual control from this page or General presets.

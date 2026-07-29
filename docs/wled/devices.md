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
| **Ignore** | Hide device from sidebar and General page (confirm: **Ignore device?**) |
| **Delete** | Remove device from controller list (confirm: **Forget device?**) |

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

## Presets

Named presets on the device page are what [Scenes](../scenes/index.md) recall for WLED devices.

| Control | Description |
|---------|-------------|
| **Save current** | Store the current look as a named preset (dialog: **Name**, placeholder *Warm lobby*) |
| **Apply** | Send the selected preset to the device |
| **Delete** | Remove the selected preset |

If no presets exist yet, the empty hint explains that you can save the current look for use in Scenes.

## State & configuration (advanced)

When **Settings → WLED → Debug Information → Show WLED debug information** is enabled, a collapsible **State & Config** section appears with raw JSON:

- **Device info (GET /json)**
- **Config (GET /json/cfg)**
- **Current state**
- Last persisted state snippet

Disable the debug toggle for normal use.

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

While party mode runs and includes this device, the device is driven by the party engine. Stop party mode (**Settings → Party → Stop Party**) to resume manual control from this page or General presets.

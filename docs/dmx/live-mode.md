# DMX live mode

The **Live** tab on a fixture page provides manual real-time control over DMX channels while the app is sending output to a configured interface.

## Prerequisites

1. **Enable DMX component** in Settings
2. USB and/or Art-Net transport configured and working (**DMX Output - ON** in the toolbar)
3. **Party mode stopped** for manual control (party blocks manual patches)

## Automatic live output

You do not start or stop live output manually. When DMX is enabled and a USB or Art-Net interface is selected and enabled, the app sends DMX packets automatically.

| Indicator | Meaning |
|-----------|---------|
| **DMX Output - ON** | Packets are being sent to the attached interface |
| **DMX Output - OFF** | No active interface — check **Settings → DMX** |

The same indicator appears on **Universe**, fixture toolbars, and **Scenes**.

!!! note "Idle / startup position"
    When output first connects, the controller applies each fixture’s **idle / startup position** cue if configured, otherwise channel **default values**.

## Live controls

Channel controls appear in a **customizable tile grid**:

- Sliders, slot selectors, color wheels, gobo wheels, shutter mode buttons, etc.
- Widget type is chosen automatically from channel type or overridden per channel

Changes are debounced (~45 ms) and patched to the DMX universe.

## Party mode banner

If party mode is running and controls this fixture, the Live tab becomes read-only and shows:

> Party mode controls this fixture. Stop Party to use manual live controls.

The display mirrors live universe values but does not accept input. The violet party border appears only while party mode is running (software control), not for normal automatic DMX output.

## Color Sweep (Color Changer)

On a Color Changer that is not a slave, the Live tab shows a **Color Sweep** panel:

1. Link other Color Changers as slaves of this master (Editor → Master fixture)
2. Confirm **DMX Output - ON**
3. Enable **Sweep**, pick direction and speed

A rainbow hue moves across the master and its slaves. Disable Sweep to return to manual color control.

## Live layout editor

1. Click **Edit layout** on the Live tab
2. Drag and resize tiles
3. Click **Done** to save

Layouts are stored **per fixture** and included in configuration backups.

## 3D preview

Moving head and smoke fixtures can show a **3D preview** tile:

| Fixture type | Preview features |
|--------------|------------------|
| **Moving head** | Pan/tilt drag, beam color, focus, intensity |
| **Smoke / hazer** | Volume / output visualization |

The preview reflects live channel values. When a cue is active, a badge shows the cue name; **Update cue** appears if live values diverge from the saved cue.

## Keyboard shortcuts

With Live tab focused (party off):

| Key | Action |
|-----|--------|
| `1`–`9`, `0` | Recall cue poses 1–10 |
| `Shift` + `↑` | Previous cue in sequence |
| `Shift` + `↓` | Next cue in sequence |

See [Cues & sequences](presets.md) for cue management.

## Blackout

Use **Blackout** on the Universe or fixture toolbar to stop party mode and set all DMX channels to 0% immediately. Output keeps streaming those zeros until you (or a scene / party) set new values.

## USB device selection

Select the USB adapter under **Settings → DMX**. Global **Enable USB transport** must be on. Click **Refresh USB devices** if you plug in hardware after starting the app. When a valid interface becomes available, **DMX Output** turns **ON** automatically.

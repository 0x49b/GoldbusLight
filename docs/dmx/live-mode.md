# DMX live mode

The **Live** tab on a fixture page provides manual real-time control over DMX channels while live output is running.

## Prerequisites

1. **Enable DMX component** in Settings
2. USB and/or Art-Net transport configured and working
3. **Start live** from the fixture toolbar or Universe **DMX Output - ON**
4. **Party mode stopped** for manual control (party blocks manual patches)

## Starting live output

| From | Action |
|------|--------|
| **Universe** | **DMX Output - ON** |
| **Fixture** | **Start live** in toolbar (fixture-focused) |

On fixture open, the controller applies the **idle / startup position** cue if configured, otherwise channel **default values**.

## Live controls

Channel controls appear in a **customizable tile grid**:

- Sliders, slot selectors, color wheels, gobo wheels, shutter mode buttons, etc.
- Widget type is chosen automatically from channel type or overridden per channel

Changes are debounced (~45 ms) and patched to the DMX universe.

## Party mode banner

If party mode is running and controls this fixture, the Live tab becomes read-only and shows:

> Party mode controls this fixture. Stop Party to use manual live controls.

The display mirrors live universe values but does not accept input.

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

## Stopping live output

| From | Action |
|------|--------|
| **Fixture** | **Stop live** |
| **Universe** | **DMX Output - OFF** |
| **Anywhere** | **Blackout** |

Stopping pushes power-off values then disconnects transports.

## USB device selection

Select the USB adapter under **Settings → DMX**. Global **Enable USB transport** must be on. Click **Refresh USB devices** if you plug in hardware after starting the app.

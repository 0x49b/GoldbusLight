# DMX fixtures

Fixtures are logical DMX devices: a name, type, start address, and list of channels with types and defaults.

## Create a fixture

**Sidebar → DMX Devices → +** (plus button on the group label)

Or import an existing profile on the new-fixture page.

## Open an existing fixture

**Sidebar → DMX Devices → *fixture name***

Existing fixtures open on the **Live** tab by default. Switch tabs: **Live**, **Cues**, **Editor**.

## Fixture toolbar (existing fixtures)

| Control | Description |
|---------|-------------|
| **Live / Cues / Editor** | View tabs |
| **Blackout** | Stop party and set all DMX channels to 0% (output keeps streaming) |
| **DMX Output - ON/OFF** | Read-only indicator — whether packets are being sent |
| **Party active** | Shown when party controls this fixture; opens Settings → Party |
| **Edit layout** | Live tab only — rearrange control tiles |
| **Save** | Persist fixture (disabled while live output is connected on Editor) |
| **⋮ menu** | Export, Clone, Delete |

New fixtures show **Import fixture** and **Save** only.

## Fixture identity

| Field | Description |
|-------|-------------|
| **Name** | Display name in sidebar and universe |
| **Brand** | Manufacturer label |
| **Fixture type** | See types below |
| **DMX start address** | 1–512; first channel of the fixture |
| **Master fixture** | **Standalone** or another fixture to mirror as a slave |

### Fixture types

Color Changer, Dimmer, Effect, Fan, Flower, Hazer, Laser, LED Bar (Beams), LED Bar (Pixels), Moving Head, Other, Scanner, Smoke, Strobe

### Moving head / scanner / laser

Additional fields:

- **Max pan (°)** — default 540°
- **Max tilt (°)** — default 270°

Used for 3D preview and party movement range calculations.

### Color Changer — Color Sweep

Color Changer masters can run a **Color Sweep**: a rainbow hue that travels across the master and its linked slaves (ordered by DMX start address).

| Setting | Description |
|---------|-------------|
| **Enable Sweep** | Turns the effect on while live output is running (also used in party mode) |
| **Direction** | Left → right (ascending address) or Right → left |
| **Speed** | How fast the hue advances (1–100%) |

Configure on the **Live** tab (quick toggle) or in the **Editor**. Link other Color Changers as slaves of the master so the rainbow moves across the row. While Sweep is enabled, manual color controls on that master are disabled; slaves continue to follow the sweep rather than a 1:1 channel mirror.

## DMX channels

Each channel row has:

| Field | Description |
|-------|-------------|
| **Offset** | Channel offset from fixture start address (1 = first channel) |
| **Type** | Semantic type (dimmer, pan, tilt, color wheel, gobo, shutter, etc.) |
| **Default value** | 0–255 applied at live start when no idle preset |
| **Live widget** | Optional override for Live tab control style |

Click **Add channel** to append the next free offset.

### Channel type editors

Some types open specialized editors:

| Type | Editor |
|------|--------|
| **Color wheel** | Slot table: DMX ranges, labels, colors |
| **Gobo wheel** | Slot table + Rosco-style catalog picker |
| **Shutter / strobe** | Mode entries (open, closed, strobe speeds) |
| **Custom** | Free-form channel entries |

Duplicate offsets show a warning in the editor.

### Common channel types

Pan, tilt, dimmer, RGB components, color wheel, gobo wheel, shutter/strobe, focus, zoom, iris, frost, prism, fog, lamp, on/off, and more — pick the type that matches your fixture personality for correct live widgets and party behavior.

## Import and export

### Import (new fixture)

1. On the **create fixture** page, click **Import fixture**
2. Select a `.json` fixture profile
3. Review channels and address in **Editor**
4. Click **Save**

### Export

**⋮ → Export** — saves fixture JSON via native file dialog.

### Clone

**⋮ → Clone** — duplicates the fixture with a new ID; adjust name and address.

### Delete

**⋮ → Delete** — removes fixture from configuration.

Example fixture JSON files ship in the repository under `fixtures/` for reference.

## Party tuning (Editor)

Per-fixture party settings:

| Setting | Description |
|---------|-------------|
| **Per-channel reaction %** | 0–100 — how strongly auto/audio party moves each channel |
| **Include in party mode** (custom / gobo wheel) | Uncheck to leave that channel untouched during party |
| **Timed strobe bursts** | Enable + on/off durations (ms) |
| **Cue chase (pose sequence)** | Ordered cues during party — see [Cues & sequences](presets.md) |

## Gobo catalog

Moving head gobo wheels can pick images from a built-in Rosco-style catalog (`/gobos/catalog.json` in the app bundle).

## Save behavior

- Editor changes require **Save**
- **Save** is disabled while live output is connected (**DMX Output - ON**) to prevent inconsistent patches
- For major structural edits, disconnect or clear the USB/Art-Net interface in **Settings → DMX** so **DMX Output** shows **OFF**, then edit and **Save**

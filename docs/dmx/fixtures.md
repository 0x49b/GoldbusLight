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
| **Blackout** | Stop party, blackout all channels, stop live output |
| **Start live / Stop live** | Toggle live output for this fixture (or universe-wide when appropriate) |
| **Party active** | Shown when party controls this fixture; link to Party page |
| **Edit layout** | Live tab only — rearrange control tiles |
| **Save** | Persist fixture (disabled while live connected on Editor) |
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
- **Save** is disabled while live output is connected to prevent inconsistent patches
- Stop live output before major structural edits

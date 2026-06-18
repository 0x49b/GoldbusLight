# Party mode

**Party mode** runs automated or audio-reactive lighting across selected **WLED devices** and **DMX fixtures**. Open it from **Sidebar → Party**.

Requires **WLED** and/or **DMX** enabled in Settings.

## Overview

While party mode runs:

- A **violet animated border** surrounds the application window
- The Party sidebar item shows a green status dot
- Included targets show green dots in the sidebar
- Manual DMX live patches are blocked for party-controlled fixtures
- WLED and DMX outputs are driven by the party engine

Stop with **Stop Party** or **In case of emergency**.

## Start and stop

| Button | Requirement |
|--------|-------------|
| **Start Party** | At least one WLED or DMX target selected |
| **Stop Party** | Always available while running |

Status line shows **Running** or **Stopped**, last frame time, and (in audio mode) last audio processing time.

## Modes

| Mode | Label | Behavior |
|------|-------|----------|
| `auto` | **Auto show** | Generative movement, color, and effects on DMX; coordinated WLED changes |
| `audio` | **Audio reactive** | Same targets driven by live audio features (level, bass, mid, treble, beat, BPM) |

Switch mode before starting, or stop and reconfigure.

## Global sliders

All sliders use **0–100%**:

| Slider | Effect |
|--------|--------|
| **Intensity** | Overall brightness / impact |
| **Speed** | Animation speed |
| **Movement range** | Pan/tilt sweep width on moving fixtures (default 70%) |
| **Color variation** | How much colors vary over time |
| **Audio sensitivity** | Audio mode only — gain on audio features |

## Targets

Two checkbox panels:

### WLED targets

Lists **online, non-ignored** WLED devices. Use **Select all** / **Clear selection**.

### DMX targets

Lists all configured fixtures. Use **Select all** / **Clear selection**.

At least one target from either list is required.

## Smoke and fog bursts

When any fixture type is **smoke** or **hazer**, additional controls appear:

| Setting | Range | Default |
|---------|-------|---------|
| **Burst duration** | 0.2–15 s | 2.5 s |
| **Pause between bursts** | 5–300 s | 45 s |
| **Burst volume** | 0–100% | 55% |

When **burst volume** is greater than 0, **all** smoke/hazer fixtures run automatically during party, even if not checked in DMX targets. Checked smoke fixtures in the target list are still tracked separately for status.

## Audio reactive mode

### Source presets

| Preset | Description |
|--------|-------------|
| **Built-in microphone** | Default system input |
| **USB microphone** | Picks USB mic if multiple |
| **Loopback / line-in** | System loopback capture |
| **Custom** | Manual device selection from full list |

Click **Refresh devices** to rescan inputs (Linux uses PulseAudio/PipeWire source names).

### Equalizer display

Shows live **level**, **bass**, **mid**, **treble**, **beat**, and estimated **BPM**.

### Status messages

| Message | Meaning |
|---------|---------|
| Capture active / starting | Audio pipeline running |
| No signal detected (amber) | Input silent — check cable or source |
| Audio capture errors (red) | See error text; common on Linux if `pw-record` missing |

## Per-fixture tuning

Configure in each fixture’s **Editor** tab (not on the Party page):

- **Per-channel reaction %** — reduce movement on sensitive channels
- **Timed strobe bursts** — rhythmic strobe during party
- **Preset chase** — play an ordered preset sequence instead of generative motion

See [DMX presets](../dmx/presets.md).

## WLED behavior in party

Party applies effects and colors to selected WLED devices based on mode and sliders. Devices not selected are unaffected.

## DMX behavior in party

Generative algorithm moves pan/tilt, color wheels, dimmers, etc., weighted by per-channel reaction settings. Fixtures with **preset chase** enabled follow their pose sequences instead.

## Interactions

| Feature | Interaction with party |
|---------|------------------------|
| DMX Live tab | Read-only while party controls fixture |
| DMX channel sweep | Requires party stopped |
| Emergency stop | Stops party and DMX output |
| General WLED presets | Useless for devices in party until party stops |

## Linux audio requirements

Audio mode on Linux needs `pactl` and `pw-record`. Install PipeWire utilities if capture fails — see [Troubleshooting](../troubleshooting.md#party-audio-issues).

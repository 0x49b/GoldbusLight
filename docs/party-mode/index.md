# Party mode

**Party mode** runs automated or audio-reactive lighting across selected **WLED devices** and **DMX fixtures**. Open it from **Settings → Party**.

Requires **WLED** and/or **DMX** enabled in Settings. The **Party** tab appears only when at least one of those components is on.

## Overview

While party mode runs:

- A **violet animated border** surrounds the application window (only while party is running — not for normal automatic DMX output)
- Included targets show green dots in the sidebar
- Manual DMX live patches are blocked for party-controlled fixtures
- WLED and DMX outputs are driven by the party engine

Stop with **Stop Party** or **Blackout**.

You can also start party mode from a [party scene](../scenes/index.md) on the Scenes page — one scene can store WLED and DMX party targets and launch party when you tap the party scene card.

## Start and stop

| Button | Requirement |
|--------|-------------|
| **Start Party** | At least one WLED, DMX, or smoke target selected |
| **Stop Party** | Always available while running |

Status line shows **Running** or **Stopped**, last frame time, and (in audio mode) last audio processing time.

## Modes

| Mode | Label | Behavior |
|------|-------|----------|
| `auto` | **Auto show** | Generative movement, color, and effects on DMX; coordinated WLED changes |
| `audio` | **Audio reactive** | Same targets driven by live audio features (level, bass, mid, treble, beat, BPM) |

Switch mode before starting, or stop and reconfigure.

## Audio reactive mode

### Source presets

| Preset | Description |
|--------|-------------|
| **Built-in microphone** | Default system input |
| **USB microphone** | Picks USB mic if multiple |
| **Loopback / line-in** | System loopback capture |
| **Custom device** | Manual device selection from full list |

**Audio sensitivity** adjusts gain on audio features. Click **Refresh devices** to rescan inputs (Linux uses PulseAudio/PipeWire source names).

### Equalizer display

Shows live **Level**, **Bass**, **Mid**, **Treble**, **Beat**, and estimated **BPM**.

### Status messages

| Message | Meaning |
|---------|---------|
| Capture: active / starting | Audio pipeline running |
| No signal detected | Input silent — check cable or source |
| Audio capture errors | See error text; common on Linux if `pw-record` missing |

## Target tabs

Party targets and per-area sliders live under three tabs: **WLED**, **DMX**, and **Smoke**. Each tab uses a transfer list (**Available** ↔ **Included**) with **Select all** / **Clear selection**.

### WLED

| Control | Notes |
|---------|-------|
| **Brightness** | 0–255 (same scale as the WLED device screen) |
| **Hue sweep speed** | 0–255 — used with Solid (effect 0) and **Color variation** |
| **Color variation** | How much colors vary over time |
| **WLED targets** | Online, non-ignored devices |
| **Effect & palette per device** | Per included device: effect, palette, speed (sx), intensity (ix) |

For Solid (effect 0), hue sweeps from brightness, hue speed, and color variation. Other effects use the per-device sx/ix values.

### DMX

| Control | Range / notes |
|---------|----------------|
| **Intensity** | Overall brightness / impact |
| **Speed** | Animation speed |
| **Color variation** | How much colors vary over time |
| **Movement range** | Pan/tilt sweep width on moving fixtures |
| **Max angle from centre** | 0–180°; **0** = **off (use range %)** |
| **Animated channels** | Which channel groups party drives (see below) |
| **DMX targets** | Party-eligible fixtures (slaves and smoke/hazer are omitted — they follow master or live under **Smoke**) |

#### Animated channels

Checkboxes under **Animated channels** choose which groups party mode drives on moving heads and similar fixtures. Uncheck a group to calm nervous motion.

| Group | Channels |
|-------|----------|
| **Movement** | Pan, tilt, motor speed |
| **Color** | Color wheel and RGB mix |
| **Gobo** | Gobo wheel, indexing, rotation |
| **Beam** | Dimmer, shutter, zoom, focus, iris, frost |
| **Effects** | Prism and prism rotation |

If a Color Changer master has **Color Sweep** enabled, party drives a spatial rainbow across that master and its slaves instead of cloning one color onto every fixture. See [DMX fixtures — Color Sweep](../dmx/fixtures.md#color-changer-color-sweep).

### Smoke

Smoke and hazer machines are configured on the **Smoke** tab (not under **DMX targets**).

| Setting | Range | Default |
|---------|-------|---------|
| **Burst duration** | 0.2–15 s | 2.5 s |
| **Pause between bursts** | 5–300 s | 45 s |
| **Burst volume** | 0–100% | 55% |
| **Smoke targets** | Transfer list of smoke/hazer fixtures |

When **Burst volume** is greater than 0, **all** smoke/hazer fixtures run automatically during party, even if not listed under **Smoke targets**. Included smoke fixtures are still tracked separately for status.

At least one target from WLED, DMX, or Smoke is required to start party.

## Per-fixture tuning

Configure in each fixture’s **Editor** tab (not on the Party page):

- **Per-channel reaction %** — reduce movement on sensitive channels
- **Timed strobe bursts** — rhythmic strobe during party
- **Cue chase (pose sequence)** — play an ordered cue sequence instead of generative motion

See [DMX cues & sequences](../dmx/presets.md).

## Interactions

| Feature | Interaction with party |
|---------|------------------------|
| DMX Live tab | Read-only while party controls fixture |
| DMX channel sweep | Requires party stopped |
| **Blackout** | Stops party and sets all DMX channels to 0%; live output keeps streaming zeros |
| General WLED presets | Useless for devices in party until party stops |
| Fixture **Party active** link | Opens **Settings → Party** |

## Linux audio requirements

Audio mode on Linux needs `pactl` and `pw-record`. Install PipeWire utilities if capture fails — see [Troubleshooting](../troubleshooting.md#party-audio-issues).

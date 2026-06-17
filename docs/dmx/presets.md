# DMX presets & sequences

The **Presets** tab stores **poses** (snapshots of channel values) and optional **sequences** that step through poses during party mode or manual recall.

## Preset poses

A **preset** captures fixture-relative channel values (offset → 0–255).

| Action | Description |
|--------|-------------|
| **Save as preset** | Capture current live values as a new pose |
| **Rename** | Edit preset label |
| **Update from live** | Overwrite preset with current live values |
| **Reorder** | Change sequence order |
| **Delete** | Remove preset |
| **Apply preset** | Jump fixture to pose (requires live on, party off) |

Per-pose timing overrides:

- **Hold (ms)** — dwell time before next pose (overrides sequence default)
- **Fade (ms)** — crossfade into pose (overrides sequence default)

## Generate show (moving heads)

**Generate show** adds ten canned moving-head poses (home, sweeps, crosses, etc.) as a starting point for programming.

## Preset sequences

Configure how presets play during **party mode** or for idle startup:

| Setting | Description |
|---------|-------------|
| **Play these presets in party mode** | Enable preset chase instead of generative party for this fixture |
| **Loop** | Restart from first pose after the last |
| **Idle / startup position** | Preset applied when live output starts |
| **Default time per pose (ms)** | `stepMs` — 100–600000 |
| **Default crossfade (ms)** | `fadeMs` — 0 = instant snap |

### Channel behaviors

For channels **not** pinned by a preset pose:

| Behavior | Meaning |
|----------|---------|
| **exclude** | Leave untouched by sequence (default) |
| **random** | Randomize during sequence steps |

Set per-channel behavior in the sequence editor.

## Manual recall

With live output on and party off:

- Click **Apply** on a preset row
- Use keyboard `1`–`0` on the Live tab

## Party integration

When **Play in party mode** is enabled for a fixture:

- Party mode steps through the preset list using configured timing
- Overrides generative pan/tilt/color algorithm for that fixture
- Other fixtures can still use generative party unless they also use sequences

## Idle preset

Select an **idle / startup** preset to position the fixture whenever live output starts. Useful for a defined “home” look before manual or party control.

## 3D preview integration

When live values differ from the applied preset, the 3D preview offers **Update preset** to sync the saved pose with the current stage look.

# DMX cues & sequences

The **Cues** tab stores **poses** (snapshots of channel values) and optional **cue sequences** that step through poses during party mode or manual recall.

## Cue poses

A **cue** captures fixture-relative channel values (offset → 0–255).

| Action | Description |
|--------|-------------|
| **Save as cue** | Capture current live values as a new pose |
| **Rename** | Edit cue label |
| **Update from live** | Overwrite cue with current live values |
| **Reorder** | Change sequence order |
| **Delete** | Remove cue |
| **Apply** | Jump fixture to pose (requires live on, party off) |

Per-pose timing overrides:

- **Hold (ms)** — dwell time before next pose (overrides sequence default)
- **Fade (ms)** — crossfade into pose (overrides sequence default)

## Generate show (moving heads)

**Generate show** adds ten canned moving-head poses (home, sweeps, crosses, etc.) as a starting point for programming.

## Cue sequences

Configure how cues play during **party mode** or for idle startup:

| Setting | Description |
|---------|-------------|
| **Play these cues in party mode (cue chase)** | Enable cue chase instead of generative party for this fixture |
| **Loop — restart from the first pose after the last (otherwise hold the final pose)** | Repeat the sequence |
| **Idle / startup position** | Cue applied when DMX output first connects (`None (channel defaults)` or a saved cue) |
| **Default time per pose (ms)** | `stepMs` — 100–600000 (default 2000) |
| **Default crossfade (ms)** | `fadeMs` — 0 = instant snap (default 0) |

### Channel behaviors

For channels **not** pinned by a cue pose:

| Behavior | Meaning |
|----------|---------|
| **exclude** | Leave untouched by sequence (default) |
| **random** | Randomize during sequence steps |

Set per-channel behavior in the sequence editor.

## Manual recall

With **DMX Output - ON** and party off:

- Click **Apply** on a cue row
- Use keyboard `1`–`0` on the Live tab

## Party integration

When **Play these cues in party mode** is enabled for a fixture:

- Party mode steps through the cue list using configured timing
- Overrides generative pan/tilt/color algorithm for that fixture
- Other fixtures can still use generative party unless they also use cue chase

## Idle / startup position

Select an **idle / startup** cue to position the fixture whenever DMX output first connects (for example after selecting a USB or Art-Net interface). Useful for a defined “home” look before manual or party control.

## 3D preview integration

When live values differ from the applied cue, the 3D preview offers **Update cue** to sync the saved pose with the current stage look.

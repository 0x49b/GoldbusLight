# DMX cues & sequences

Fixtures store two kinds of poses on separate tabs:

| Tab | Used by |
|-----|---------|
| **Party cues** | Party mode chase sequences and Live keyboard recall |
| **Scene cues** | [Scenes](../scenes/index.md) — static looks applied with a scene |

Smoke fixtures hide both cue tabs. Color Changer fixtures hide **Party cues** only.

## Cue poses

A **cue** captures fixture-relative channel values (offset → 0–255).

| Action | Description |
|--------|-------------|
| **Create from live** | Capture current live values as a new pose |
| **Rename** | Edit cue label |
| **Update from live** | Overwrite cue with current live values |
| **Reorder** | Change sequence order |
| **Delete** | Remove cue |
| **Apply** | Jump fixture to pose (requires live on, party off) |

Per-pose timing overrides (party cues):

- **Hold (ms)** — dwell time before next pose (overrides sequence default)
- **Fade (ms)** — crossfade into pose (overrides sequence default)

## Generate show (moving heads)

On **Party cues**, **Generate show** adds ten canned moving-head poses (home, sweeps, crosses, etc.) as a starting point for programming.

## Cue sequences (Party cues)

Configure how party cues play during **party mode** or for idle startup:

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

## Scene cues

**Scene cues** are static poses only — no chase timing. Create them from live, apply them manually, or pick them when building a standard scene under **Sidebar → Scenes → Manage**.

## Manual recall

With the **DMX** badge green (output sending) and party off:

- Click **Apply** on a cue row
- Use keyboard `1`–`0` on the Live tab (party cues 1–10)

## Party integration

When **Play these cues in party mode** is enabled for a fixture:

- Party mode steps through the party cue list using configured timing
- Overrides generative pan/tilt/color algorithm for that fixture
- Other fixtures can still use generative party unless they also use cue chase

## Idle / startup position

Select an **idle / startup** cue to position the fixture whenever DMX output first connects (for example after selecting a USB or Art-Net interface). Useful for a defined “home” look before manual or party control.

## 3D preview integration

When live values differ from the applied cue, the 3D preview offers **Update cue** to sync the saved pose with the current stage look.

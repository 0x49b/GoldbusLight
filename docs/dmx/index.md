# DMX overview

The **DMX** component controls up to **four DMX universes** (512 channels each) over **USB** (Enttec Pro–compatible adapters) and/or **Art-Net**. You define **fixtures** (logical devices) with channel layouts, then patch, live-control, and automate them.

## Prerequisites

1. **Settings → DMX** — enable **Enable DMX component**
2. Hardware or simulator:
   - USB-DMX adapter selected in Settings, and/or
   - Art-Net target host configured
3. At least one **fixture** created or imported

## Transport options

| Transport | Settings location | Notes |
|-----------|-------------------|-------|
| **USB** | Settings → DMX → per-universe interface card → USB device | Global **Enable USB transport (all universes)** must be on |
| **Art-Net** | Settings → DMX → per-universe interface card → **Enable Art-Net for {universe}** | UDP to target IP/broadcast; net/subnet/universe mapping per universe |
| **Simulators** | Settings → DMX → testing toggles | In-process fake USB/Art-Net for development |

Both USB and Art-Net can be active simultaneously; live output fans out to all enabled transports.

## Main areas

| Area | Path | Purpose |
|------|------|---------|
| [Universe view](universe.md) | Sidebar → Universe | Address grid, conflicts, drag readdress, output toggle |
| [Fixtures](fixtures.md) | Sidebar → DMX Devices | Create, import, channel editor |
| [Live mode](live-mode.md) | Fixture → Live tab | Manual control, 3D preview, layout editor |
| [Cues & sequences](presets.md) | Fixture → Cues tab | Saved poses, show generation, party cue chase |

## DMX output lifecycle

1. Configure fixtures and addresses
2. **Start live** from Universe or a fixture page (or start party mode)
3. Adjust channels on **Live** tabs or via party automation
4. **Stop live** or use **Blackout** to blackout and disconnect

## Party mode integration

DMX fixtures can be party targets. While party runs, manual live patches are blocked for controlled fixtures. Configure per-fixture party weights and cue chases in the fixture **Editor**.

## Blackout (emergency stop)

**Blackout** (Universe header or fixture toolbar):

1. Stops party mode
2. Sets all DMX channels to 0 (blackout)
3. Stops DMX live output

## Channel sweep (test tool)

**Settings → DMX → DMX fixture channel sweep (test mode)** sweeps each channel 0→255 to help identify physical wiring. Requires party mode stopped. See [Settings](../settings/index.md).

## Multiple universes

The Universe view supports up to **four** logical universes. Use **Add Universe** to create another; **Remove Universe** deletes an empty universe only. Each universe has its own USB device and Art-Net settings under **Settings → DMX**. Fixtures are assigned to a universe in the fixture **Editor**.

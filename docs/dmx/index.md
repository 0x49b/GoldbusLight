# DMX overview

The **DMX** component controls a single **DMX universe** (512 channels) over **USB** (Enttec Pro–compatible adapters) and/or **Art-Net**. You define **fixtures** (logical devices) with channel layouts, then patch, live-control, and automate them.

## Prerequisites

1. **Settings → DMX** — enable **Enable DMX component**
2. Hardware or simulator:
   - USB-DMX adapter selected in Settings, and/or
   - Art-Net target host configured
3. At least one **fixture** created or imported

## Transport options

| Transport | Settings location | Notes |
|-----------|-------------------|-------|
| **USB** | Settings → DMX → DMX USB interface | Enttec Pro protocol; select adapter from dropdown |
| **Art-Net** | Settings → DMX → Art-Net output | UDP to target IP/broadcast; net/subnet/universe mapping |
| **Simulators** | Settings → DMX → testing toggles | In-process fake USB/Art-Net for development |

Both USB and Art-Net can be active simultaneously; live output fans out to all enabled transports.

## Main areas

| Area | Path | Purpose |
|------|------|---------|
| [Universe view](universe.md) | Sidebar → Universe | Address grid, conflicts, drag readdress, output toggle |
| [Fixtures](fixtures.md) | Sidebar → DMX Devices | Create, import, channel editor |
| [Live mode](live-mode.md) | Fixture → Live tab | Manual control, 3D preview, layout editor |
| [Presets](presets.md) | Fixture → Presets tab | Saved poses, show generation, party sequences |

## DMX output lifecycle

1. Configure fixtures and addresses
2. **Start live** from Universe or a fixture page (or start party mode)
3. Adjust channels on **Live** tabs or via party automation
4. **Stop live** or use **In case of emergency** to blackout and disconnect

## Party mode integration

DMX fixtures can be party targets. While party runs, manual live patches are blocked for controlled fixtures. Configure per-fixture party weights and preset chases in the fixture **Editor**.

## Emergency stop

**In case of emergency** (Universe header or fixture toolbar):

1. Stops party mode
2. Sets all 512 channels to 0 (blackout)
3. Stops DMX live output

## Channel sweep (test tool)

**Settings → DMX → DMX fixture channel sweep** sweeps each channel 0→255 to help identify physical wiring. Requires party mode stopped. See [Settings](../settings/index.md).

## Single universe

The UI presents **Universe 1** only. Art-Net net/subnet/universe fields map to this logical universe.

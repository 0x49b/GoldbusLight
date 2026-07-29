# DMX overview

The **DMX** component controls a **DMX universe** (512 channels) over **USB** (Enttec Pro–compatible adapters, Open DMX / Cable) and/or **Art-Net**. You define **fixtures** (logical devices) with channel layouts, then patch, live-control, and automate them.

## Prerequisites

1. **Settings → DMX** — enable **Enable DMX component**
2. Hardware or simulator:
   - USB-DMX adapter selected in Settings, and/or
   - Art-Net target host configured
3. At least one **fixture** created or imported

## Transport options

| Transport | Settings location | Notes |
|-----------|-------------------|-------|
| **USB** | Settings → DMX → DMX interface → USB device | Global **Enable USB transport** must be on |
| **Art-Net** | Settings → DMX → DMX interface → **Enable Art-Net** | UDP to target IP/broadcast; net/subnet/Art-Net universe mapping |
| **Simulators** | Settings → DMX → testing toggles | In-process fake USB/Art-Net for development |

Both USB and Art-Net can be active simultaneously; live output fans out to all enabled transports.

## Main areas

| Area | Path | Purpose |
|------|------|---------|
| [Universe view](universe.md) | Sidebar → Universe | Address grid, conflicts, drag readdress, output indicator |
| [Fixtures](fixtures.md) | Sidebar → DMX Devices | Create, import, channel editor |
| [Live mode](live-mode.md) | Fixture → Live tab | Manual control, 3D preview, layout editor |
| [Cues & sequences](presets.md) | Fixture → Cues tab | Saved poses, show generation, party cue chase |

## DMX output lifecycle

1. Configure fixtures and addresses
2. Enable DMX and select a USB and/or Art-Net interface — output starts automatically (**DMX Output - ON**)
3. Adjust channels on **Live** tabs, apply scenes, or start party automation
4. Use **Blackout** for an instant all-channel zero (streaming continues with zeros)

!!! tip "Output indicator"
    **DMX Output - ON/OFF** on Universe, fixture pages, and Scenes is a status indicator only. It does not start or stop sending.

## Party mode integration

DMX fixtures can be party targets. While party runs, manual live patches are blocked for controlled fixtures. The violet party border appears only while party mode is running. Configure per-fixture party weights and cue chases in the fixture **Editor**.

## Blackout (emergency stop)

**Blackout** (Universe header or fixture toolbar):

1. Stops party mode
2. Sets all DMX channels to 0% immediately
3. Keeps sending those zeros to the attached interface

Raise levels again from Live controls, a scene, or party mode when you are ready.

## Channel sweep (test tool)

**Settings → DMX → DMX fixture channel sweep (test mode)** sweeps each channel 0→255 to help identify physical wiring. Requires party mode stopped. See [Settings](../settings/index.md).

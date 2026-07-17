# Scenes

**Scenes** are named looks you can recall with one tap. A scene can apply WLED presets and DMX scene cues together, or act as a **party mode scene** that starts automated party lighting on selected targets.

Open **Sidebar → Scenes** (visible when WLED and/or DMX is enabled).

## Overview

| Scene type | What it does |
|------------|--------------|
| **Standard scene** | Applies stored WLED presets and DMX **scene cues** (static poses) |
| **Party scene** | Starts **party mode** on the WLED and DMX targets you configure for that scene |

Scenes and party mode are **mutually exclusive at runtime**: applying a standard scene stops party mode; starting party (from the Party page or a party scene) clears the active standard scene.

## Apply a scene

1. Open **Sidebar → Scenes**.
2. Tap a **standard** scene card to apply it.

The card shows an **Active** badge while that scene is applied. Counts under the name show how many WLED devices and DMX fixtures are included.

!!! tip "DMX output"
    If a scene includes DMX fixtures, a USB or Art-Net interface must be configured under **Settings → DMX**. The controller tries to start DMX live output automatically when you apply a scene.

## Manage scenes

Click **Manage** to create, edit, import, export, or delete scenes.

### Name

Every scene needs a **Name** (for example `Lobby warm`).

### Startup default

For an existing scene, enable **Apply this scene when the app starts** to recall it automatically about two seconds after launch.

!!! warning "Only one default"
    Only one scene can be the startup default. If another scene is already the default, the app asks you to **Replace default** before switching.

Party scenes cannot be the startup default.

### Party mode scene

Enable **Party mode scene** to designate this scene as the single party scene in your configuration.

!!! warning "Only one party scene"
    Only one scene can be the party scene at a time. If another scene is already designated, the app asks you to **Replace party scene** before switching.

When party mode is enabled for a scene:

- The standard WLED preset and DMX scene-cue editors are hidden.
- **Party targets** appear instead — the same style of checkbox lists used on the [Party mode](../party-mode/index.md) page.

#### Party targets

| Panel | Lists |
|-------|--------|
| **WLED targets** | Online, non-ignored WLED devices |
| **DMX targets** | Party-eligible fixtures (slave fixtures are omitted; they follow their master) |

Use **Select all** / **Clear selection** in each panel. Save the scene after choosing targets.

### Standard scene content

When **Party mode scene** is off:

#### WLED devices

Use the transfer list to include devices, then pick a **preset** per device (presets are created on each device’s page).

#### DMX fixtures

Use the transfer list to include fixtures, then pick a **scene cue** per fixture.

!!! note "Scene cues vs party cues"
    Scenes use each fixture’s **Scene cues** tab (static poses). Party mode uses separate party tuning and cue sequences on the fixture editor — not scene cues.

### Import and export

- **Import** — load a portable `scene-*.json` bundle and map devices/fixtures on this machine.
- **Export** — save the selected scene for sharing or backup.
- **Delete** — remove the selected scene (clears default or party designation if this scene held it).

Click **Save scene** or **Create scene** to persist changes.

## Start party from a scene

When a scene is the designated **party scene**, its card shows a **Party** badge and a **Start party** button.

1. Open **Sidebar → Scenes**.
2. Find the scene with the **Party** badge.
3. Click **Start party**.

The controller copies that scene’s party targets into party mode configuration and starts the party engine. Sliders, mode (auto/audio), and other party settings come from the [Party mode](../party-mode/index.md) page — adjust them there before or between runs.

| Button state | Meaning |
|--------------|---------|
| **Start party** | Ready — at least one target should be selected on the scene |
| **Starting…** | Party is launching |
| **Party running** | Party is active (button disabled until you stop party) |

Stop party from **Sidebar → Party** with **Stop Party**, or use **Blackout** from the universe view.

## Scene card badges

| Badge | Meaning |
|-------|---------|
| **Default** | Applied automatically on app startup |
| **Party** | Designated party scene; use **Start party** |
| **Active** | Standard scene currently applied |

## Related topics

- [Party mode](../party-mode/index.md) — sliders, audio reactive mode, smoke bursts
- [DMX fixtures](../dmx/fixtures.md) — scene cues and party tuning per fixture
- [WLED devices](../wled/devices.md) — device presets used by standard scenes
- [Backup & restore](../settings/backup-restore.md) — scenes travel with full configuration backups

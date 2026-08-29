# Scenes

**Scenes** are named looks you can recall with one tap. A scene can apply WLED presets and DMX scene cues together, or act as a **party mode scene** that starts automated party lighting on selected targets.

Open **Sidebar → Scenes** (visible when WLED and/or DMX is enabled). This is the default page when the app starts.

## Overview

| Scene type | What it does |
|------------|--------------|
| **Standard scene** | Applies stored WLED presets and DMX **scene cues** (static poses) |
| **Party scene** | Starts **party mode** on the WLED and DMX targets you configure for that scene |

Scenes and party mode are **mutually exclusive at runtime**: applying a standard scene stops party mode; starting party (from **Settings → Party** or a party scene) clears the active standard scene.

## Apply a scene

1. Open **Sidebar → Scenes**.
2. Tap a **standard** scene card.
3. Confirm **Switch scene** if prompted (the dialog warns if party mode will stop).

The card shows an **Active** badge while that scene is applied. Counts under the name show how many WLED devices and DMX fixtures are included. While applying, the card may show **· Applying…**.

### Re-apply the active scene

Tap the already-**Active** standard scene again to re-apply it immediately — no confirmation dialog. Use this after lights drifted or after someone adjusted a fixture by hand.

### Active badge clears on manual edits

When you change WLED or DMX output manually (for example on a device page or fixture **Live** tab), the controller clears the **Active** badge. There is no separate Clear button — the badge simply disappears until you apply a scene again.

!!! tip "DMX output"
    If a scene includes DMX fixtures, a USB or Art-Net interface must be configured under **Settings → DMX**. When an interface is ready, the app sends DMX automatically — the **DMX** badge on the Scenes header turns green while packets are being sent. Applying a scene uses that live output.

## Manage scenes

Click **Manage** to create, edit, import, export, or delete scenes. Use **Back to scenes** to return to the grid.

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
- **Party targets** appear instead — transfer lists matching the style used on [Party mode](../party-mode/index.md).

#### Party targets

| Panel | Lists |
|-------|--------|
| **WLED targets** | Non-ignored WLED devices (online and offline) |
| **DMX targets** | Party-eligible fixtures (slave fixtures are omitted; they follow their master) |

Use **Select all** / **Clear selection** in each panel. Changes are saved when you click **Save scene**, switch to another scene, or leave the editor.

Party targets are shared with **Settings → Party**. Removing a WLED device (or DMX fixture) in either place updates the other. Sliders, mode (auto/audio), and effect settings still live only on **Settings → Party**.

### Standard scene content

When **Party mode scene** is off:

#### WLED devices

Use the transfer list (**Available** / **Included**) to include devices, then pick a **preset** per device (presets are created on each device’s page with **Save current**).

#### DMX fixtures

Use the transfer list to include fixtures, then pick a **scene cue** per fixture.

!!! note "Scene cues vs party cues"
    Scenes use each fixture’s **Scene cues** tab (static poses). Party mode uses separate party tuning and cue sequences on the **Party cues** tab — not scene cues.

### Import and export

- **Import** — load a portable `scene-*.json` bundle and map devices/fixtures on this machine.
- **Export** — save the selected scene for sharing or backup.
- **Delete** — remove the selected scene (clears default or party designation if this scene held it).

Click **Save scene** or **Create scene** to persist changes.

## Start party from a scene

When a scene is the designated **party scene**, its card shows a **Party** badge.

1. Open **Sidebar → Scenes**.
2. Find the scene with the **Party** badge.
3. Tap the card.
4. Confirm **Start party** in the **Start party mode?** dialog.

The controller starts the party engine using that scene’s WLED and DMX targets. Those targets stay in sync with **Settings → Party** — changing membership in either place updates the other. Sliders, mode (auto/audio), and other party settings come from **Settings → Party** — adjust them there before or between runs.

While party is launching, the card may show **· Starting…**. While party is already running, the party scene card is disabled until you stop party.

Stop party from **Settings → Party** with **Stop Party**, or use **Blackout** from Scenes, Universe, or a fixture toolbar.

## Scene card badges

| Badge | Meaning |
|-------|---------|
| **Default** | Applied automatically on app startup |
| **Party** | Designated party scene; tap the card to start party |
| **Active** | Standard scene currently applied (or party scene while party is running) |

## Related topics

- [Party mode](../party-mode/index.md) — sliders, audio reactive mode, smoke bursts
- [DMX fixtures](../dmx/fixtures.md) — scene cues and party tuning per fixture
- [WLED devices](../wled/devices.md) — device presets used by standard scenes
- [Backup & restore](../settings/backup-restore.md) — scenes travel with full configuration backups

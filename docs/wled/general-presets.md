# WLED general presets

The **General** page (**Sidebar → WLED → General**) applies color, brightness, and effects to **all non-ignored WLED devices** at once.

## Color & brightness

| Control | Behavior |
|---------|----------|
| **All on / All off** | Toggles power on every device (sun/moon icon) |
| **Warm white** | Applies warm white preset to all |
| **Cold white** | Applies cold white preset to all |
| **Color** dropdown | Ten named color temperature / white presets |
| **Color hue slider** | Live RGB updates to all devices (~200 ms debounce) |
| **Brightness** slider | 1–255 internal range (shown as percentage in UI) |

!!! tip "Brightness behavior"
    Moving the hue slider pushes color updates to all devices. Brightness is applied together with color presets and the All on/off flow. Adjust brightness before or while applying a color preset for best results.

## Effect & palette

| Control | Behavior |
|---------|----------|
| **Effect** | Picker; effect names come from the first online device |
| **Palette** | Picker; palette names from first online device |
| **Speed (sx)** | 0–255 — applied immediately to all via segment payload |
| **Intensity (ix)** | 0–255 — applied immediately to all |

Effect and palette changes send `{seg: [{fx, pal, sx, ix}]}` style updates to all devices.

## Persistence

General tab state (power, brightness, RGB, effect, palette, speed, intensity) is saved in the controller configuration and included in [configuration backups](../settings/backup-restore.md).

## When General is unavailable

The General page requires **WLED** to be enabled. If WLED is off, enable it under **Settings → WLED**.

## Party mode

General presets do not run during party mode for devices included in party targets. Stop party mode to use General again.

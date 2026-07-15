# Interface & navigation

The application uses a persistent **sidebar** and a **main content** area. Navigation is route-based: each sidebar item opens a different view in the main panel.

## Sidebar layout

```
Goldbus Light Controller
<status line>

WLED                           [if WLED enabled]
  General
  Devices  [+]
    <device name>
DMX                            [if DMX enabled]
  Universe
  DMX Devices  [+]
    <fixture name> - <TYPE>

Party                          [if WLED or DMX enabled]

Settings
```

### Header

- **Title:** Goldbus Light Controller
- **Status line:** Live summary from the controller (connectivity, last update). Hover for the full string if truncated.

### WLED section

Visible when **Enable WLED component** is on in Settings.

| Item | Route | Description |
|------|-------|-------------|
| **General** | Global presets for all non-ignored WLED devices |
| **Devices → *name*** | Per-device detail page (online devices only) |
| **+** (group action) | **Add WLED device** — enter IPv4 address and port |

Offline devices appear grayed out in the sidebar. **Double-click** or **double-tap** an offline entry to refresh it, or use **Settings → WLED → Refresh**.

### DMX section

Visible when **Enable DMX component** is on in Settings.

| Item | Route | Description |
|------|-------|-------------|
| **Universe** | 512-channel universe grid, drag-to-readdress, DMX output toggle |
| **DMX Devices → *name* - TYPE*** | Fixture editor / live / cues |
| **+** (group action) | **Create new DMX device** |

Fixture icons reflect type:

- Moving head — headlight icon
- Smoke / hazer — cloud icon
- Other — bulb icon

Slave fixtures (mirroring a master) appear **indented** under their master in the sidebar.

### Party section

Visible when **WLED** or **DMX** is enabled. Opens the [Party mode](../party-mode/index.md) page.

- **Status dot:** Green while party mode is running; neutral when stopped.

### Settings

Always available at the bottom of the sidebar. Opens [Settings](../settings/index.md) with General, WLED, DMX, and Console tabs.

## Main content area

- Scrollable panel with padding
- **Error banner** at the top when something fails (red alert with **Dismiss**)
- Page-specific content below

## Visual indicators

### Party running

When party mode is active:

- Animated **violet border** around the entire window
- Party sidebar item shows a green status dot
- Fixtures and WLED devices **included in the party** show green dots even if not individually “live”

### DMX live output

When DMX live output is connected:

- Fixture entries in the sidebar may show a green dot when that fixture is part of live output
- Universe grid shows green **Live** markers on active fixture blocks; slaves show **Slave**

### Device loading

Opening a device page may show a loading modal: *Loading device state …* or *Refreshing device …* with an attempt counter while the controller retries unreachable devices.

## Detached transport console

From **Settings → Console**, you can **Detach** the transport log into a separate window titled **Goldbus Transport Console**. The main Settings page hides the Console tab while detached. Use **Attach back** in the detached window to return the console to Settings.

## Disabled routes

If the current page’s component is disabled in Settings, the main area shows:

> This page is disabled by current component settings. Open Settings to enable it.

Enable **WLED** or **DMX** under Settings to restore the page.

## Window behavior

- Default window size is approximately **1400×788** pixels
- On Raspberry Pi with `GOLDBUS_FULLSCREEN=1`, the app starts fullscreen
- The controller snapshot refreshes in the background about every 30 seconds to detect devices coming back online

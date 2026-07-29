# Interface & navigation

The application uses a persistent **sidebar** and a **main content** area. Navigation is route-based: each sidebar item opens a different view in the main panel.

## Sidebar layout

```
Goldbus Light Controller
<status line>

Scenes                         [if WLED or DMX enabled]
WLED                           [if WLED enabled]
  General
  Devices  [+]
    <device name>
DMX                            [if DMX enabled]
  Universe
  DMX Devices  [+]
    <fixture name>

Settings
```

Party mode is **not** a sidebar item. Open it from **Settings → Party**.

### Header

- **Title:** Goldbus Light Controller
- **Status line:** Live summary from the controller (connectivity, last update). Hover for the full string if truncated.

### Scenes section

Visible when **WLED** or **DMX** is enabled. Opens the [Scenes](../scenes/index.md) page. This is also the default landing page when the app starts.

| Item | Route | Description |
|------|-------|-------------|
| **Scenes** | Scene grid and manager | Apply standard looks or start party from the designated party scene |

### WLED section

Visible when **Enable WLED component** is on in Settings.

| Item | Route | Description |
|------|-------|-------------|
| **General** | Global presets for all non-ignored WLED devices |
| **Devices → *name*** | Per-device detail page |
| **+** (group action) | **Add WLED device** — enter IPv4 address and port |

Offline devices appear grayed out in the sidebar. **Double-click** or **double-tap** an offline entry to refresh it, or use **Settings → WLED → Refresh**.

### DMX section

Visible when **Enable DMX component** is on in Settings.

| Item | Route | Description |
|------|-------|-------------|
| **Universe** | 512-channel universe grid, drag-to-readdress, output indicator |
| **DMX Devices → *name*** | Fixture editor / live / cues (type shown via icon) |
| **+** (group action) | **Create new DMX device** |

Fixture icons reflect type:

- Moving head — headlight icon
- Smoke / hazer — cloud icon
- Other — bulb icon

Slave fixtures (mirroring a master) appear **indented** under their master in the sidebar.

### Settings

Always available at the bottom of the sidebar. Opens [Settings](../settings/index.md) with tabs: **General**, **WLED**, **DMX**, **Party** (when WLED or DMX is on), and **Console**.

## Main content area

- Scrollable panel with padding
- **Error banner** at the top when something fails (title **Error**, dismiss with **Dismiss error**; auto-dismisses after a few seconds)
- Page-specific content below

## Visual indicators

### Party running

When party mode is active (software takes control):

- Animated **violet border** around the entire window — reserved for party mode only
- Fixtures and WLED devices **included in the party** show green dots

Normal automatic DMX output (party off) does **not** show the violet border.

### DMX live output

When DMX is enabled and a USB or Art-Net interface is attached and ready, the app sends packets automatically. The **DMX** badge on Universe, fixture pages, Scenes, and the companion shows that state:

- **Green** styling — packets are being sent
- **Rose** styling — not sending

- Fixture entries in the sidebar may show a green dot when live output is connected
- Universe grid shows green **Live** markers on active fixture blocks; slaves show **Slave**

### Device loading

Opening a device page may show a loading modal: *Loading…* or *Refreshing…* with an attempt counter while the controller retries unreachable devices.

## Detached transport console

From **Settings → Console**, you can **Detach** the transport log into a separate window. The main Settings page hides the Console tab while detached. Use **Attach back** in the detached window to return the console to Settings.

## Disabled routes

If the current page’s component is disabled in Settings, the main area shows:

> This page is disabled by current component settings. Open Settings to enable it.

Enable **WLED** or **DMX** under Settings to restore the page.

## Window behavior

- Default window size is approximately **1400×788** pixels
- On Raspberry Pi with `GOLDBUS_FULLSCREEN=1`, the app starts fullscreen
- From **Settings → General → Window display** you can **Enter fullscreen** / **Exit fullscreen** and **Maximize window** / **Restore window** (when the desktop shell supports it)
- The controller snapshot refreshes in the background about every 30 seconds to detect devices coming back online

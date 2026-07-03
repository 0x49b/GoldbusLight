# Getting started

This chapter walks through the first steps after installing Goldbus Light Controller.

## First launch

When you open the application, you see:

- A **sidebar** on the left with navigation and device/fixture lists
- A **status line** under the title showing controller state (connectivity, last update, etc.)
- A **main content area** on the right for the active page

The default page depends on which components are enabled. If WLED is on, you land on **General** (global WLED presets). If only DMX is on, open **Universe** or a fixture from the sidebar.

## Enable components

Goldbus Light Controller can run WLED control, DMX control, or both. Each area is toggled independently.

1. Open **Settings** (gear icon at the bottom of the sidebar).
2. Go to the **WLED** tab and switch on **Enable WLED component** if you control WLED devices.
3. Go to the **DMX** tab and switch on **Enable DMX component** if you control DMX fixtures.
4. Settings save automatically after a short idle period, or immediately when you flip a toggle.

!!! note "Disabled pages"
    If you navigate to a page whose component is turned off, the main area shows a message asking you to enable it in Settings.

## Typical workflows

### WLED-only setup

1. **Settings → WLED** — enable the component; optionally enable **Auto-provision newly added devices**.
2. Click **+** next to **Devices** in the sidebar and enter each WLED device’s **IPv4 address**.
3. Online devices appear under **Devices** in the sidebar.
4. Use **General** for presets applied to all devices, or open a device for per-segment control.

See [WLED overview](wled/index.md) for full detail.

### DMX-only setup

1. **Settings → DMX** — enable the component.
2. Connect a USB-DMX adapter and configure it on each universe’s interface card in **Settings → DMX**, or enable **Art-Net** per universe.
3. Click **+** next to **DMX Devices** to create a fixture (or import a JSON profile).
4. Open **Universe** to verify addressing and start DMX output.
5. Open a fixture and use the **Live** tab for manual control.

See [DMX overview](dmx/index.md) for full detail.

### Combined WLED + DMX show

1. Configure WLED devices and DMX fixtures as above.
2. Optionally tune per-fixture party behavior in each fixture’s **Editor** tab.
3. Open **Party** from the sidebar.
4. Select WLED and DMX targets, choose **Auto show** or **Audio reactive**, adjust sliders.
5. Click **Start Party**.

See [Party mode](party-mode/index.md) for full detail.

### Move configuration to another machine

1. **Settings → General → Export backup** — saves a `.goldbus-backup.json` file.
2. On the new host, install the app and use **Import backup**.

See [Backup & restore](settings/backup-restore.md).

## Blackout (emergency stop)

The red **Blackout** button appears on the DMX **Universe** view and on each fixture’s toolbar. Tooltip: *Stop party mode, blackout all DMX channels, and stop live output*.

1. Stops Party mode
2. Blackouts all DMX channels (if live output was active)
3. Stops DMX live output

The status line confirms: `Emergency stop: party off, DMX blackout, output stopped`.

## Keyboard shortcuts (DMX live)

When a fixture’s **Live** tab is focused and party mode is off:

| Key | Action |
|-----|--------|
| `1`–`9`, `0` | Recall preset poses 1–10 |
| `Shift` + `↑` / `↓` | Step to previous / next preset |

## Where data is stored

The controller persists settings, device lists, DMX fixtures, party configuration, general-tab state, and per-fixture live layouts to disk. The exact path is shown at the bottom of **Settings** (persistence path). Use **Export backup** before major changes or when migrating hosts.

# Transport console

The transport console logs low-level communication between the controller and WLED devices, USB DMX, and Art-Net. Use it for debugging connectivity and protocol issues.

## Location

**Settings → Console** tab

Hidden from the tab list while the console is **detached** into a separate window.

## Log entries

Each entry includes:

| Field | Example |
|-------|---------|
| Timestamp | ISO time |
| Transport | `wled`, `usb-dmx`, `artnet`, etc. |
| Direction | `out`, `in`, `info`, `error` |
| Target | Device address or adapter |
| Summary | Short description |
| Detail | Expandable payload (JSON or hex) |

## Controls

| Button | Action |
|--------|--------|
| **Clear** | Wipe the log buffer |
| **Detach** | Open console in a separate window |

## Detached window

Detached mode opens **Goldbus Transport Console** in a second window (`/?view=console-window`).

| Control | Action |
|---------|--------|
| **Attach back** | Close detached window; console returns to Settings tab |

Only one detached console is supported.

## Buffer size

The UI keeps the most recent **500** entries in a ring buffer. Long-running shows may roll off older messages.

## Poll interval

The console refreshes from the backend about every **750 ms** while visible.

## When to use the console

| Scenario | What to look for |
|----------|------------------|
| WLED device not responding | Failed HTTP requests, timeouts |
| DMX not outputting | USB write errors, Art-Net packet logs |
| Party stutter | High error rate on audio or DMX transports |
| After config change | Verify expected commands fire |

## Log file

For persistent logs outside the UI, set the environment variable `GOLDBUS_LOG_FILE` to a file path before starting the application. See [Troubleshooting](../troubleshooting.md).

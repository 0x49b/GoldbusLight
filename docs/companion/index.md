# Phone companion (pre-show focus)

The **phone companion** is a small website served by Goldbus Light Controller on the same host as the kiosk. Use it to walk the stage (for example outdoor moving heads while the Pi stays indoors) and adjust **DMX fixtures** and **WLED** before the show.

The desktop/kiosk app keeps running. Companion does **not** replace Party mode, Scenes editing, or fixture setup.

## Enable

1. On the kiosk open **Settings → General → Phone companion**.
2. Turn on **Enable companion web UI**.
3. Leave the **Port** at `8765` unless it conflicts with another service.
4. Wait until the panel shows that the companion is listening, then note the URL(s) or scan the QR code.

Settings autosave; the HTTP listener starts within a couple of seconds.

## Connect from a phone

1. Join the same network as the controller:
   - the controller’s **Wi‑Fi access point** (Settings → WLED → Access point), or
   - the same LAN as the Pi/desktop host.
2. Open a listed URL in the phone browser (for example `http://10.42.0.1:8765/` on the default NetworkManager shared AP), or scan the QR code.
3. You should see **Goldbus Companion** with DMX fixtures and WLED devices.

!!! tip "AP gateway"
    With the built-in access point (`ipv4.method=shared`), phones usually reach the Pi at **`10.42.0.1`**. Prefer the URL that starts with that address when the AP is enabled.

## Focus a moving head (typical workflow)

1. On the kiosk, ensure **DMX output is ON** and **Party mode is stopped**.
2. On the phone, open the fixture.
3. On **Live**, raise dimmer / open shutter, then set **pan**, **tilt**, **focus**, zoom, color, etc.
4. Enter a cue name and tap **Save cue**.
5. Optionally open **Cues → Set idle** so that pose is the startup/idle position when live output connects.
6. Use **Apply** to recall a saved cue, or **Update active cue from live** after fine-tuning.

Cue data is the same `party.cueSequence` store used on the desktop; saves persist to `dmx.json` on the host.

## WLED

Open a device to toggle power, brightness, solid color, or apply an existing device preset. Use this for house/fill strips while focusing heads.

## Limits

| Available on phone | Not on phone |
|--------------------|--------------|
| Fixture live channel controls | Party start/stop |
| Save / apply / idle cues | Scenes editor |
| WLED on / bri / color / presets | Fixture & universe setup |
| | Settings / backup |

Live edits are blocked while Party is running (same rule as desktop Live mode).

## Security

The companion binds on **all interfaces** (`0.0.0.0`). Anyone on the Wi‑Fi/LAN can steer lights. Protect the access point with a strong password and keep the host physically secure. See also [Network & access point](../settings/network.md).

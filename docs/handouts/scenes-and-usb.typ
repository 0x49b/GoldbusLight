#set page(
  paper: "a4",
  margin: (x: 1.1cm, y: 1.0cm),
)
#set text(font: "Helvetica", size: 8.6pt, fill: rgb("#1a1a1a"))
#set par(leading: 0.42em, justify: false)
#show heading.where(level: 1): set text(size: 11pt, weight: "bold", fill: rgb("#111"))
#show heading.where(level: 2): set text(size: 9.2pt, weight: "bold", fill: rgb("#222"))

#let brand = rgb("#b8860b")
#let muted = rgb("#555")
#let rule = rgb("#d0d0d0")
#let soft = rgb("#f7f5f0")
#let ok = rgb("#1a7f37")
#let bad = rgb("#b42318")

#let pill(body, fill: brand) = box(
  fill: fill.lighten(88%),
  stroke: 0.5pt + fill.lighten(40%),
  inset: (x: 5pt, y: 2pt),
  radius: 2pt,
  text(size: 7.5pt, weight: "bold", fill: fill.darken(15%), body),
)

#let step(n, body) = grid(
  columns: (14pt, 1fr),
  column-gutter: 4pt,
  align: (center + top, top),
  box(
    width: 12pt,
    height: 12pt,
    fill: brand,
    radius: 2pt,
    align(center + horizon, text(size: 7pt, weight: "bold", fill: white, str(n))),
  ),
  body,
)

#let ui(label) = text(weight: "bold", label)

// Header
#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  [
    #text(size: 16pt, weight: "bold", fill: rgb("#111"))[Goldbus Light]
    #h(6pt)
    #text(size: 10pt, fill: muted)[Quick reference]
    #v(-2pt)
    #text(size: 8pt, fill: muted)[Scenes · USB DMX interface]
  ],
  text(size: 7.5pt, fill: muted)[One page · keep near the console],
)

#v(4pt)
#line(length: 100%, stroke: 1pt + brand)
#v(6pt)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 14pt,
  row-gutter: 0pt,

  // ——— LEFT: SCENES ———
  [
    = Scenes

    #v(2pt)
    #text(fill: muted)[
      Named lighting looks you recall with one tap.
      Open #ui[Sidebar → Scenes].
    ]

    #v(4pt)
    == Two scene types
    #v(2pt)
    #grid(
      columns: (1fr, 1fr),
      column-gutter: 6pt,
      box(fill: soft, inset: 6pt, radius: 3pt, width: 100%)[
        #pill[Standard]
        #v(2pt)
        Applies stored *WLED presets* and DMX *scene cues* (static looks).
      ],
      box(fill: soft, inset: 6pt, radius: 3pt, width: 100%)[
        #pill(fill: rgb("#6b4f1d"))[Party]
        #v(2pt)
        Starts *party mode* on the WLED / DMX targets you pick for that scene.
      ],
    )

    #v(5pt)
    #text(size: 7.5pt, fill: muted)[
      Standard scenes and party mode are mutually exclusive: applying one stops the other.
    ]

    #v(6pt)
    == Apply a scene
    #v(3pt)
    #step(1)[Open #ui[Scenes] and tap a scene card.]
    #v(2pt)
    #step(2)[Confirm #ui[Switch scene] (or #ui[Start party] for the party scene).]
    #v(2pt)
    #step(3)[Look for the #ui[Active] badge on the card.]

    #v(5pt)
    #box(fill: soft, inset: 6pt, radius: 3pt, width: 100%)[
      *Badges:* #ui[Active] = currently applied · #ui[Default] = runs at startup · #ui[Party] = party scene
    ]

    #v(6pt)
    == Create or edit
    #v(3pt)
    #step(1)[Click #ui[Manage] → #ui[Create scene] (or select an existing scene).]
    #v(2pt)
    #step(2)[Set a #ui[Name] (e.g. “Lobby warm”).]
    #v(2pt)
    #step(3)[
      *Standard:* move WLED / DMX into #ui[Included], then pick a *preset* or *scene cue* for each.
    ]
    #v(2pt)
    #step(4)[
      *Party:* enable #ui[Party mode scene], then choose #ui[WLED targets] / #ui[DMX targets].
    ]
    #v(2pt)
    #step(5)[Click #ui[Create scene] or #ui[Save scene].]

    #v(5pt)
    #box(
      stroke: 0.6pt + brand.lighten(30%),
      fill: brand.lighten(92%),
      inset: 6pt,
      radius: 3pt,
      width: 100%,
    )[
      *Scene cues* live on each fixture page under #ui[Scene cues] — set the look on #ui[Live], then capture it. Scenes do *not* use party cues.
    ]

    #v(6pt)
    == Tips
    #v(2pt)
    - Enable #ui[Apply this scene when the app starts] for a startup look (not for party scenes).
    - Use #ui[Import] / #ui[Export] to share a scene as JSON.
    - #ui[Blackout] stops party and zeros channels; DMX output keeps streaming.
  ],

  // ——— RIGHT: USB ———
  [
    = USB DMX interface

    #v(2pt)
    #text(fill: muted)[
      Required for DMX fixtures in scenes. Output starts automatically when an interface is ready — there is no Start/Stop DMX button.
    ]

    #v(4pt)
    == Attach & select
    #v(3pt)
    #step(1)[Plug in an *Enttec Pro–compatible* USB-DMX adapter.]
    #v(2pt)
    #step(2)[Open #ui[Settings → DMX].]
    #v(2pt)
    #step(3)[Turn on #ui[Enable DMX component].]
    #v(2pt)
    #step(4)[Turn on #ui[Enable USB transport].]
    #v(2pt)
    #step(5)[Click #ui[Refresh USB devices], then pick the adapter (not #ui[No device selected]).]

    #v(5pt)
    #grid(
      columns: (1fr, 1fr),
      column-gutter: 6pt,
      box(fill: ok.lighten(90%), stroke: 0.6pt + ok.lighten(50%), inset: 6pt, radius: 3pt, width: 100%)[
        #text(fill: ok, weight: "bold", size: 7.5pt)[DMX badge · green]
        #v(1pt)
        Connected — packets are being sent.
      ],
      box(fill: bad.lighten(90%), stroke: 0.6pt + bad.lighten(50%), inset: 6pt, radius: 3pt, width: 100%)[
        #text(fill: bad, weight: "bold", size: 7.5pt)[DMX badge · red]
        #v(1pt)
        Disconnected — no active adapter.
      ],
    )

    #v(6pt)
    == Troubleshooting checklist
    #v(3pt)
    #set list(marker: text(fill: brand)[☐], indent: 0pt, body-indent: 6pt)
    - #ui[Enable DMX component] is on
    - #ui[Enable USB transport] is on
    - Adapter listed after #ui[Refresh USB devices]
    - Real device selected (not #ui[No device selected])
    - Toolbar #ui[DMX] badge is green
    - Adapter is Enttec Pro–compatible (or OpenDMX-style)
    - Linux / Pi: user in `dialout` for `/dev/ttyUSB*` or `/dev/ttyACM*`
    - After import or host change: re-select the USB device (paths change)

    #v(5pt)
    #box(fill: soft, inset: 6pt, radius: 3pt, width: 100%)[
      *Selected device unavailable?* Unplug → replug → #ui[Refresh USB devices] → select again. There is no separate Reconnect button.
    ]

    #v(6pt)
    == Dig deeper
    #v(3pt)
    #step(1)[
      #ui[Settings → Console] → watch *USB DMX* lines for `USB DMX adapter started…` or `USB write failed`.
    ]
    #v(2pt)
    #step(2)[
      Optional: enable #ui[Simulate USB-DMX512 interface] to test the UI without hardware.
    ]
    #v(2pt)
    #step(3)[
      Channel mapping issues: #ui[Settings → DMX → DMX fixture channel sweep] (stop party first).
    ]

    #v(6pt)
    #box(
      stroke: 0.6pt + brand.lighten(30%),
      fill: brand.lighten(92%),
      inset: 6pt,
      radius: 3pt,
      width: 100%,
    )[
      *Scenes say “No DMX interface configured”?* \
      Open #ui[DMX settings], enable USB (and/or Art-Net), select a device, then retry the scene.
    ]

    #v(6pt)
    == Quick recovery
    #v(2pt)
    #text(size: 8pt)[
      Refresh → re-select → confirm green #ui[DMX] badge → apply scene again.
    ]
  ],
)

#v(1fr)
#line(length: 100%, stroke: 0.5pt + rule)
#v(3pt)
#grid(
  columns: (1fr, auto),
  text(size: 7pt, fill: muted)[Goldbus Light Controller · Scenes & USB DMX quick reference],
  text(size: 7pt, fill: muted)[Matches in-app labels (EN)],
)

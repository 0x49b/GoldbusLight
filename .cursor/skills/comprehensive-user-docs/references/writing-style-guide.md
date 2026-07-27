# Writing style guide

End-user manual prose standards distilled from the GoldbusLight documentation run.

---

## Audience

- **Primary:** Operator installing and running the app (e.g. venue tech, Pi kiosk admin)
- **Not:** Contributors building the app (link to `setup.md` instead)
- **Assumed knowledge:** Basic OS use (terminal on Pi, Wi-Fi concepts); not programming

---

## Voice

- Second person: "Open **Settings**", "Click **Start Party**"
- Present tense, active voice
- Complete sentences (no telegram bullets without verbs)
- Confident and precise; avoid "simply", "just", "obviously"

---

## UI references

### Navigation paths

Use arrow chains matching the sidebar hierarchy:

```markdown
**Sidebar → Settings → DMX → Enable DMX component**
**Sidebar → DMX → Universe**
**Fixture → Live tab**
```

### Control labels

- **Bold** exact UI strings: **Start Party**, **In case of emergency**
- Match capitalization from code (`DMX Output — ON/OFF`, not `Dmx output on`)
- Quote disabled-page messages verbatim in blockquotes

### Code vs UI

- UI labels: **bold**
- File paths, env vars, shell commands: `` `backticks` ``
- Keys in backup JSON / types: `` `camelCase` `` only in advanced or settings-deep sections

---

## Structure per page

1. **H1 title** — user-facing name, not code symbol
2. One-sentence purpose
3. **Prerequisites** (if any) — component toggles, hardware
4. **Navigation** — where to open this in the app
5. **Main content** — tables, controls, workflows
6. **Related** — cross-links
7. Optional **Troubleshooting** subsection for page-specific issues

---

## Tables (use heavily)

### Capability overview (home page)

```markdown
| Area | Capabilities |
|------|----------------|
| **WLED** | Discover, control, presets |
```

### Settings fields

```markdown
| Setting | Default | Notes |
|---------|---------|-------|
| Interval (s) | 15 | Minimum 2 |
```

### Workflows vs reference

- **Workflows:** numbered lists
- **Reference:** tables

---

## Admonitions (MkDocs Material)

```markdown
!!! note "Disabled pages"
    If the component is off, the main area shows: ...

!!! warning
    Import **replaces** the current configuration.

!!! tip "Display glitches"
    Restart the session if WebKit shows artifacts.
```

Use for: data loss, forced-off toggles, platform quirks, hidden features.

---

## Workflows

Number steps; each step is one action:

```markdown
### First-time DMX setup

1. **Settings → DMX** — enable the component.
2. Connect USB adapter and select it under **DMX USB interface**.
3. Click **+** next to **DMX Devices** to create a fixture.
4. Open **Universe** and turn **DMX Output** on.
```

---

## Cross-linking

- Relative links: `[Party mode](../party-mode/index.md)`
- Link early in overviews ("See [Installation](installation/index.md)")
- Troubleshooting links back to setup sections

---

## Installation docs

- Copy commands **exactly** from install scripts (verified by reading `scripts/`)
- Document env var overrides in a table
- Include **What the installer does** table (users trust transparency)
- Always document **rollback** if script keeps `.previous` binary

---

## Troubleshooting

Format:

```markdown
## Area — symptom heading

### Specific problem

1. Concrete fix with navigation path
2. Shell command if needed

| Problem | Things to try |
|---------|----------------|
| No devices | Enable component; run Discover |
```

Pull symptoms from: error banners, tooltips, `title=` attributes, offline disabled states.

---

## Document honestly

When code ≠ UI:

```markdown
!!! note
    There is no **Provision** button on the device page. Use **Auto-provision** in Settings.
```

---

## Avoid

| Bad | Good |
|-----|------|
| "The user can configure DMX" | "Open **Settings → DMX** and enable **Enable DMX component**" |
| `SettingsView` | "Controller settings" |
| Huge prose paragraphs | Tables + short paragraphs |
| Documenting every channel type | Group by fixture editor sections; link to types only in advanced appendix if needed |
| Inventing menu items | Grep `SidebarMenuButton` and route kinds |

---

## Length targets

| Page type | Target |
|-----------|--------|
| Overview (`index.md`) | 80–150 lines |
| Feature page | 60–120 lines |
| Install guide | 100–180 lines |
| Troubleshooting | 120–200 lines total |

Prefer more pages over longer pages.

---

## Markdown mechanics

- Use `---` only as MkDocs/YAML requires; not decorative in body
- Tables need blank line before them in some parsers
- Escape `<` in troubleshooting if needed: `&gt;` or wording "greater than 0"
- Do not use HTML character entities inside code fences

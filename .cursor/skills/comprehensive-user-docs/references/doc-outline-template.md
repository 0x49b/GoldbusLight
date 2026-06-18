# Documentation outline template

Adapt this `nav` tree to the product. **Mirror the application sidebar**, not the repository layout.

---

## Recommended `mkdocs.yml` nav skeleton

```yaml
nav:
  - Home: index.md
  - Getting started: getting-started.md
  - Installation:
      - installation/index.md
      - [Platform A]: installation/[platform-a].md
      - [Platform B]: installation/[platform-b].md
  - Interface:
      - interface/navigation.md
  - [Domain 1]:
      - [domain1]/index.md
      - [Subfeature]: [domain1]/[subfeature].md
  - [Domain 2]:
      - [domain2]/index.md
      - ...
  - [Cross-cutting mode e.g. Party/Automation]:
      - [mode]/index.md
  - Settings:
      - settings/index.md
      - [Subsystem]: settings/[subsystem].md
  - Troubleshooting: troubleshooting.md
```

---

## Page briefs (what each file must contain)

### `index.md` (Home)

- One-paragraph product description
- Capability table (areas × what users can do)
- Supported platforms table
- Quick start (5–7 numbered steps)
- Documentation map (links to all top-level sections)
- Update/install pointer if applicable

### `getting-started.md`

- First launch description (layout regions)
- Enable/configure core components
- 3–4 **workflow** subsections with numbered steps:
  - First-time setup (domain A only)
  - First-time setup (domain B only)
  - Combined workflow
  - Migration/backup pointer
- Emergency / stop-all if exists
- Keyboard shortcuts table (if any)
- Where data is stored on disk

### `installation/index.md`

- Release download table (asset × platform)
- Links to per-platform guides
- System requirements (runtime, not build deps)
- Party/audio/network optional deps if user-visible
- Pointer to developer build docs (link only)

### `installation/[platform].md`

- Before you begin
- Step-by-step install commands (exact, from scripts)
- What the installer does (table)
- Env var overrides table
- Post-install steps (service, autologin, reboot)
- Update procedure
- Rollback procedure
- Optional feature packages

### `interface/navigation.md`

- ASCII or bullet sidebar tree with **exact labels**
- Table: sidebar item → route → description
- Status indicators (dots, borders, badges)
- Modals and detached windows
- Disabled route message (quote exact UI copy)
- Window size / fullscreen / kiosk notes

### `[domain]/index.md`

- Prerequisites (which component toggle must be on)
- Sub-areas table with links
- Device/state vocabulary (online, offline, ignored)
- Cross-links to settings and party/automation

### `[domain]/[feature].md`

- Settings location or navigation path
- Controls table
- Parameters with defaults/ranges from types
- Workflows
- Interactions with automation/party mode
- `!!! note` for gaps and non-obvious behavior

### `party-mode/index.md` (or equivalent)

- Start/stop requirements
- Mode table (auto vs manual vs audio)
- Global sliders table
- Target selection UI
- Per-device tuning (where configured — often not on party page itself)
- Blocking rules (what manual controls are disabled)
- Platform-specific requirements (audio libs)

### `settings/index.md`

- Tab list
- Autosave behavior
- Component master toggles and cascade effects
- Footer metadata explained
- Links to detailed settings chapters
- Test/diagnostic tools in settings

### `settings/backup-restore.md`

- Navigation path
- Export steps
- Included/excluded data tables
- Import warning (overwrite)
- Migration workflow source → target

### `settings/network.md` (if applicable)

- Field table
- Apply vs disable-now buttons
- Dry-run behavior
- OS requirements
- Security notes

### `settings/console.md` (if applicable)

- Log fields
- Clear / detach / attach
- Buffer limits, poll interval
- When to use for debugging

### `troubleshooting.md`

Organize by symptom domain:

```markdown
## [Domain] — [symptom]

### [Specific problem]

1. Fix step
2. Fix step

| Problem | Things to try |
|---------|----------------|
```

Include: emergency recovery, log file env var, link to GitHub issues.

---

## File naming conventions

- Lowercase paths: `docs/dmx/live-mode.md`
- `index.md` per folder for overview pages
- Hyphenated filenames for multi-word features
- Match `nav` labels to user-facing names, not code identifiers

---

## Depth rule

| Complexity | Pages |
|------------|-------|
| Simple feature (one screen) | Section in parent page |
| Multi-tab feature | Overview + one page per tab |
| Install per platform | Always separate pages |
| Settings | Overview + one page per tab only if tab is large |

GoldbusLight result: **20 pages**, **~1850 lines** for a multi-domain desktop app with WLED + DMX + Party + Pi install.

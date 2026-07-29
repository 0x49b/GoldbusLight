# GoldbusLight worked example

Reference implementation: [0x49b/GoldbusLight](https://github.com/0x49b/GoldbusLight) — user manual PR on branch `cursor/user-manual-docs-78c6`.

---

## User prompt (original)

```text
write a comprehensive user manual for the application that lives in /docs in the repository and can be deployed by a github action to github pages at the repository
```

---

## Agent execution summary

| Phase | Actions | Time |
|-------|---------|------|
| 1 Recon | README, App.tsx, AppShell, types, settings view, party view, release.yml | ~20 min |
| 1b Subagent | Task explore — full feature outline with UI paths | ~5 min |
| 2 IA | 20-page nav mirroring WLED/DMX/Party sidebar | ~10 min |
| 3 Write | 20 markdown files, ~1850 lines | ~45 min |
| 4 MkDocs | mkdocs.yml, requirements-docs.txt, local build | ~10 min |
| 5 Deploy | docs.yml + release.yml merge | ~10 min |
| 6 Verify | mkdocs build, README link, commit/push | ~5 min |

---

## File tree produced

```
docs/
  index.md
  getting-started.md
  installation/
    index.md
    raspberry-pi.md
    desktop.md
  interface/
    navigation.md
  wled/
    index.md
    discovery.md
    devices.md
    general-presets.md
  dmx/
    index.md
    universe.md
    fixtures.md
    live-mode.md
    presets.md
  party-mode/
    index.md
  settings/
    index.md
    backup-restore.md
    network.md
    console.md
  troubleshooting.md
mkdocs.yml
requirements-docs.txt
.github/workflows/docs.yml
```

---

## Key source files read

| File | What was extracted |
|------|-------------------|
| `frontend/src/App.tsx` | Route → view mapping |
| `frontend/src/components/layout/AppShell.tsx` | Sidebar tree, exact labels, status dots |
| `frontend/src/types/controller.ts` | All settings fields, DMX types, party config |
| `../../../../frontend/src/components/settings/SettingsView.tsx` | Every settings tab control |
| `../../../../frontend/src/components/settings/components/party/PartyModeView.tsx` | Party sliders, audio, smoke |
| `frontend/src/components/dmx/DMXUniverseView.tsx` | Grid, drag readdress, emergency |
| `frontend/src/components/dmx/DMXFixtureEditorView.tsx` | Editor/live/presets tabs |
| `.github/workflows/release.yml` | Pages deploy + `stable/update.json` |
| `scripts/install-raspberry-pi.sh` | Exact install commands |
| `scripts/install-release.sh` | Update/rollback |
| `setup.md` | PipeWire audio, nmcli (troubleshooting) |

---

## Nav mirrors sidebar (intentional)

App sidebar:

```
Party
WLED → General, Devices
DMX → Universe, DMX Devices
Settings
```

Manual nav:

```
Party mode
WLED → discovery, devices, general-presets
DMX → universe, fixtures, live-mode, presets
Settings → backup, network, console
```

Extra top-level: Installation, Interface, Troubleshooting (not in app but user-needed).

---

## Deployment pattern

**Problem:** `release.yml` already deploys `pages/stable/update.json` to GitHub Pages.

**Solution:**

1. `docs.yml` — on doc pushes, `curl` existing `update.json` into `site/stable/` before upload
2. `release.yml` — `checkout` + `mkdocs build` + `rsync` docs into `pages/` alongside fresh `update.json`

---

## Metrics

| Metric | Value |
|--------|-------|
| Markdown pages | 20 |
| Total lines added | ~1850 |
| mkdocs build time | ~0.3 s |
| pip packages | 2 (mkdocs, mkdocs-material) |

---

## Quality highlights users praised

1. **Exact UI labels** — "Goldbus Light Controller", "In case of emergency"
2. **Complete settings coverage** — every toggle in SettingsView
3. **Install fidelity** — commands copied from shell scripts
4. **Workflows** — first-time WLED, DMX, party, migration
5. **Honest gaps** — no Provision button documented
6. **Troubleshooting** — PipeWire, nmcli, Pi service commands
7. **Professional site** — Material theme, search, tabs, dark mode

---

## Reuse checklist for another repo

1. Replace exploration file list in prompt-templates.md §2
2. Replace `site_url` / `repo_url` in mkdocs.yml
3. Replace sidebar tree in interface/navigation.md template
4. Adjust `pages/stable/update.json` preservation URL in docs.yml (or remove if no existing Pages artifact)
5. Run exploration subagent before writing — do not copy GoldbusLight content

# Codebase exploration checklist

Use this before writing any manual content. Check off items as you read source files.

---

## Repository root

- [ ] `README.md` — product summary, build vs run instructions
- [ ] `setup.md` / `CONTRIBUTING.md` — OS packages, env vars (user-relevant parts only)
- [ ] `package.json` / `go.mod` — product name, version hints
- [ ] `scripts/install-*` — first-time install, update, rollback
- [ ] `.github/workflows/` — release assets, GitHub Pages, deploy targets
- [ ] Existing `docs/`, `pages/`, `mkdocs.yml`, `book.toml`

---

## Navigation & routing

Find the **single source of truth** for routes:

- [ ] App entry (`App.tsx`, `main.dart`, `routes.rb`, etc.)
- [ ] Shell / layout (sidebar, header, footer)
- [ ] Route type enum or router config
- [ ] Conditional visibility (feature flags, `enabled` toggles hiding nav items)
- [ ] Default landing route
- [ ] Detached windows / secondary views (query params, `?view=`)

Extract:

- Exact sidebar labels (including non-English UI titles)
- Status dots, badges, banners (party mode border, offline gray-out)
- Error alert component and dismiss behavior
- Modal dialogs (discovery, loading)

---

## Settings & configuration

- [ ] Settings type/interface (all fields and nested objects)
- [ ] Settings UI view (tabs, cards, autosave debounce)
- [ ] What each master toggle disables (redirect behavior, forced off states)
- [ ] Persistence path shown in UI footer
- [ ] Import/export / backup format and warnings
- [ ] Network/AP apply and dry-run behavior

---

## Feature domains (repeat per domain)

For each major product area:

- [ ] Overview/index view
- [ ] List view (devices, fixtures, projects)
- [ ] Detail/editor view
- [ ] Create flow (+ button, import)
- [ ] Live/runtime mode vs edit mode
- [ ] Emergency or stop-all control
- [ ] Keyboard shortcuts
- [ ] Party/automation mode interactions (what gets blocked)

Per view, capture:

| UI element | Label | Enabled when | Action |
|------------|-------|--------------|--------|
| Button | | | |
| Toggle | | | |
| Slider | | range | |
| Dropdown | | options | |

---

## Backend / service layer (selective)

Only read enough to document **user-visible behavior**:

- [ ] Main window flags (fullscreen env var, title, size)
- [ ] Discovery/provisioning sequence
- [ ] Emergency stop order of operations
- [ ] Party mode start/stop preconditions
- [ ] File dialogs (export/import extensions)
- [ ] Platform-specific capabilities (nmcli, audio backends)

Skip: internal package structure, test files, binding generation unless user-facing.

---

## Installation matrix

From CI release workflow and README:

| Asset | Platform | Constraints |
|-------|----------|-------------|
| | | |

- [ ] Unsigned / notarized notes
- [ ] Architecture exclusions (e.g. no armv7)
- [ ] Required runtime libraries
- [ ] systemd / desktop entry / kiosk behavior
- [ ] Update mechanism (in-app vs shell script)

---

## Gaps & honesty log

Record features that exist in code but lack UI:

```text
Example: onProvisionDevice wired but no Provision button — document auto-provision in Settings only.
```

Include these in the manual so power users are not misled.

---

## Exploration tools (priority order)

1. **Read** App.tsx, AppShell, settings types, settings view
2. **Grep** `route.kind`, `Settings`, `enabled`, `onClick`, `aria-label`, `title=`
3. **Glob** `**/components/**/*.tsx` for view names
4. **Task explore agent** for breadth on 100+ file repos
5. **Read** install scripts and workflows last to align install docs with reality

---

## Time budget heuristic

| Repo size | Exploration | Writing | Deploy |
|-----------|-------------|---------|--------|
| Small (<30 UI files) | 15–30 min | 45–90 min | 15 min |
| Medium (30–100) | 30–60 min | 2–4 hrs | 20 min |
| Large (100+) | 1–2 hrs + subagents | 4–8 hrs | 30 min |

Do not start writing until the outline covers every nav item.

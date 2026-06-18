---
name: comprehensive-user-docs
description: Create feature-complete end-user manuals from a codebase and deploy them to GitHub Pages via MkDocs Material. Use when the user asks for user documentation, a user manual, docs in /docs, GitHub Pages documentation, help guides, or comprehensive product documentation for an application.
compatibility: Requires repository read access, ability to run shell commands, and network for pip/MkDocs. Optional GitHub Actions for Pages deploy.
metadata:
  version: "1.0"
  provenance: GoldbusLight user manual (2026-06)
---

# Comprehensive User Documentation

Produce **end-user manuals** (not developer API docs) that mirror the real product: every navigable screen, setting name, workflow, install path, and troubleshooting scenario. Deploy as a searchable MkDocs Material site from `/docs` to GitHub Pages.

Read reference files in this skill folder when executing a phase:

| File | Use when |
|------|----------|
| [references/prompt-templates.md](references/prompt-templates.md) | Copy-paste prompts for exploration, outline, writing, deploy |
| [references/exploration-checklist.md](references/exploration-checklist.md) | What to read in an unknown codebase |
| [references/doc-outline-template.md](references/doc-outline-template.md) | Default information architecture |
| [references/writing-style-guide.md](references/writing-style-guide.md) | Tone, tables, admonitions, cross-links |
| [references/mkdocs-and-pages.md](references/mkdocs-and-pages.md) | mkdocs.yml, requirements, GitHub Actions |
| [references/goldbuslight-example.md](references/goldbuslight-example.md) | Worked example from a real project |

---

## When to use

- User asks for a **user manual**, **user docs**, **documentation in `/docs`**, or **GitHub Pages** help site
- Product has a UI (web, desktop, mobile shell) and the manual must match what users actually see
- Existing README/setup.md is developer-oriented and needs a user-facing companion

## When NOT to use

- API reference only (use OpenAPI/Swagger or code-doc tools)
- Single-page changelog or one FAQ answer
- Internal architecture docs for engineers (different audience)

---

## Workflow (6 phases)

Execute in order. Do not skip exploration.

### Phase 1 — Reconnaissance (read the product, not guesses)

**Goal:** Build a factual map of user-facing features before writing a single manual page.

1. Read `README.md`, any existing `docs/`, `setup.md`, install scripts, and `.github/workflows/` (especially Pages/release).
2. Find the **navigation shell** (sidebar, routes, tabs): e.g. `App.tsx`, `AppShell.tsx`, router config.
3. Find **settings/types** that list every toggle and field: e.g. `types/controller.ts`, settings views.
4. List **one view component per major feature** and read each (limit ~200 lines each, then targeted grep).
5. Launch a **readonly explore subagent** (Task tool, `subagent_type: explore`, `readonly: true`) with the prompt in [references/prompt-templates.md](references/prompt-templates.md) § Exploration.
6. Record: UI labels (exact strings), routes, settings keys, workflows, gaps (features in code but not in UI).

**Exit criteria:** Structured outline with navigation paths, setting names, and workflows — no placeholder sections.

### Phase 2 — Information architecture

**Goal:** Map product areas → manual sections (mirror the app, not the repo folder tree).

1. Start from [references/doc-outline-template.md](references/doc-outline-template.md).
2. Adapt sections to the product (e.g. WLED, DMX, Party → your domains).
3. Plan `mkdocs.yml` `nav:` to match sidebar mental model.
4. One **overview** page per domain + **focused** child pages for complex areas (installation, settings subsystems).
5. Always include: Home, Getting started, Installation, Interface/navigation, Settings, Troubleshooting.

**Exit criteria:** Complete `nav` tree and file list under `docs/` before writing prose.

### Phase 3 — Write the manual (user voice)

**Goal:** Feature-complete prose a non-developer can follow.

Follow [references/writing-style-guide.md](references/writing-style-guide.md). Rules of thumb:

- Document **paths** as users see them: `Sidebar → Settings → DMX → Enable DMX component`
- Use **exact UI labels** in bold; match spelling and capitalization from the UI
- Every settings field: name, purpose, default/range, what happens when toggled off
- Include **workflows** (numbered steps) for first-time setup, daily use, migration, emergency
- Use tables for settings, keyboard shortcuts, platform matrix, asset names
- Use MkDocs admonitions (`!!! note`, `!!! warning`, `!!! tip`) for non-obvious behavior
- Cross-link related pages with relative Markdown links
- Add **Troubleshooting** entries tied to real error messages and status strings from code
- Note **gaps** honestly (e.g. "no Provision button in UI; use auto-provision in Settings")

**Exit criteria:** Every route in the app shell has a manual section; no "TBD" sections.

### Phase 4 — MkDocs Material site

**Goal:** Professional, searchable static site.

1. Add `mkdocs.yml` at repo root (`docs_dir: docs`).
2. Add `requirements-docs.txt`: `mkdocs>=1.6,<2` and `mkdocs-material>=9.5,<10`.
3. Configure Material theme: tabs, sections, search, code copy, light/dark palette matching product if possible.
4. Run `pip install -r requirements-docs.txt && mkdocs build -d /tmp/site` and fix broken links.

Details: [references/mkdocs-and-pages.md](references/mkdocs-and-pages.md).

### Phase 5 — GitHub Pages deployment

**Goal:** Docs live at `https://<user>.github.io/<repo>/` and update on push.

1. Add `.github/workflows/docs.yml` — trigger on `master` pushes to `docs/**`, `mkdocs.yml`, workflow file.
2. Use `actions/upload-pages-artifact` + `actions/deploy-pages` with `pages: write` and `id-token: write`.
3. If the repo **already deploys other Pages content** (e.g. `stable/update.json`), **merge artifacts** — do not overwrite. Fetch existing files from live Pages before upload, or build docs in the release workflow alongside other `pages/` content.
4. Link the manual from root `README.md`.

Details: [references/mkdocs-and-pages.md](references/mkdocs-and-pages.md).

### Phase 6 — Verify

1. `mkdocs build` succeeds with zero errors.
2. Spot-check 3 workflows against the app (install, primary feature, settings save).
3. All `nav` entries resolve to existing files.
4. Commit, push, open PR; note that repo **Settings → Pages → Source** must be **GitHub Actions**.

---

## User request prompts (feed these to an agent)

### Minimal prompt

```text
Write a comprehensive user manual for the application in /docs, deployable to GitHub Pages via GitHub Actions. Follow the comprehensive-user-docs skill exactly.
```

### Full prompt (recommended)

```text
Write a comprehensive end-user manual for this application:

1. Source markdown in /docs
2. Build with MkDocs Material (mkdocs.yml + requirements-docs.txt)
3. Deploy via GitHub Actions to GitHub Pages on push to master
4. Cover every user-facing screen, setting, and workflow (not developer API docs)
5. Include installation, troubleshooting, backup/migration if the app supports them
6. Use exact UI labels from the codebase
7. Link the manual from README.md

Before writing, explore the codebase thoroughly (App shell, routes, settings types, feature views, install scripts, existing workflows). Do not invent features.

Follow the comprehensive-user-docs skill.
```

### Iteration prompts

```text
Expand the [WLED/DMX/Settings] section with every field from [ComponentName].tsx and settings types. Add workflows and troubleshooting rows.
```

```text
Add GitHub Pages deploy workflow; preserve existing pages/stable/update.json on doc-only deploys.
```

---

## Quality bar (checklist before done)

- [ ] Manual matches **sidebar/routes**, not repo directory structure
- [ ] Every **Settings** toggle and text field documented with effect when disabled
- [ ] **Installation** covers all published release artifacts and platform constraints
- [ ] **Getting started** has 3+ end-to-end workflows (first setup, daily use, migrate/backup)
- [ ] **Troubleshooting** maps symptoms → concrete fixes (commands, settings paths)
- [ ] **Emergency / destructive actions** documented (blackout, delete, import overwrite)
- [ ] `mkdocs build` passes
- [ ] GitHub Actions workflow present and documented in README
- [ ] No developer-only content (Go module paths, binding generation) unless in a collapsible "advanced" note

---

## Anti-patterns

| Avoid | Do instead |
|-------|------------|
| Document from README only | Read UI components and types |
| One giant `manual.md` | Sectioned site with nav matching the app |
| "Click the button" | "Click **Start Party** (Sidebar → Party)" |
| Generic "configure settings" | List each setting by UI label |
| Skip offline/error states | Document grayed-out sidebar, banners, modals |
| Break existing Pages deploy | Merge with existing `pages/` artifacts |

---

## Subagent usage

For codebases with 50+ frontend files, run **parallel** exploration:

1. **explore** agent → navigation, routes, app shell
2. **explore** agent → settings, persistence, backup
3. **explore** agent → install scripts, CI, releases

Merge outlines before writing. Use `readonly: true` for exploration agents.

---

## Deliverables

| Artifact | Location |
|----------|----------|
| Manual pages | `docs/**/*.md` |
| Site config | `mkdocs.yml` |
| Python deps | `requirements-docs.txt` |
| Deploy workflow | `.github/workflows/docs.yml` |
| README link | `README.md` |
| Optional | Update release workflow to bundle docs |

See [references/goldbuslight-example.md](references/goldbuslight-example.md) for a complete file tree and metrics from a production run (~20 pages, ~1850 lines, 6 phases).

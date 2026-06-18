# Prompt templates

Copy-paste prompts used to produce feature-complete user manuals. Replace bracketed placeholders.

---

## 1. Primary user request (give this to the agent)

```text
Write a comprehensive user manual for the application that lives in /docs in the repository and can be deployed by a GitHub action to github pages at the repository.
```

**Agent interpretation:** End-user docs (not dev docs), MkDocs + GitHub Pages, explore codebase first.

---

## 2. Exploration subagent (Task tool)

Use `subagent_type: explore`, `readonly: true`, thoroughness: **very thorough**.

```text
Explore the [PRODUCT_NAME] repository at [REPO_PATH] to document all user-facing features comprehensively. Focus on:

1. [DOMAIN_A] features: [list suspected areas from README]
2. [DOMAIN_B] features: [list suspected areas]
3. [CROSS_CUTTING] mode/settings if any
4. Settings: network, backup/restore, console/logs
5. Installation: platform scripts, releases, CI artifacts
6. Any existing pages/ or docs/ structure

Read key files:
- [App entry: e.g. frontend/src/App.tsx]
- [Shell/nav: e.g. AppShell.tsx]
- [Settings view: e.g. ControllerSettingsView.tsx]
- [Types: e.g. types/controller.ts]
- [Hooks/store: e.g. useControllerApp.ts] (first 150 lines + grep for action names)
- [Main backend entry if relevant: e.g. cmd/*/main.go]
- Install scripts under scripts/ or packaging/
- .github/workflows/*.yml (release, pages)

Return a structured outline with:
- Sidebar/navigation tree (exact labels)
- Per-page UI controls (buttons, toggles, fields) with exact names
- Settings keys and defaults where visible in types
- User workflows (first-time setup, daily use, emergency, migration)
- Gaps (code exists but no UI button)
- Platform/install constraints from README and CI

Do not write the manual — only the outline.
```

### GoldbusLight instance (actual prompt used)

```text
Explore the GoldbusLight repository at /workspace to document all user-facing features comprehensively. Focus on:

1. DMX features: universe view, fixture editor, live mode, presets, emergency, USB/Art-Net
2. WLED features: discovery, device detail, general presets, provisioning
3. Party mode: auto vs audio, configuration
4. Settings: network/AP, backup/restore, console
5. Installation: Raspberry Pi scripts, releases
6. Any existing pages/ or docs/ structure

Read key files: DMXUniverseView.tsx, DMXFixtureEditorView.tsx, DMXFixtureLiveControls.tsx, GeneralPanel.tsx, DeviceDetailView.tsx, ControllerSettingsView.tsx (rest), scripts/install-*.sh, cmd/goldbuslight/main.go

Return a structured outline of all features with enough detail to write a user manual. Include UI navigation paths, key settings names, and workflows.
```

---

## 3. Parallel exploration (large repos)

Split by domain and run **concurrent** Task agents:

```text
Agent A — Navigation & shell only. Return route enum, sidebar tree, status indicators, modals.
```

```text
Agent B — Settings & persistence. Return every settings field, autosave behavior, backup format, file paths.
```

```text
Agent C — Install & CI. Return release asset matrix, install scripts, env vars, update/rollback procedures.
```

**Merge rule:** Deduplicate routes and settings; resolve conflicts by re-reading source file.

---

## 4. Outline validation (self-check before writing)

```text
Given this exploration outline, produce:
1. mkdocs.yml nav: tree
2. docs/ file list (every path)
3. List of UI labels that must appear verbatim
4. List of workflows (minimum 8 across install, features, settings, troubleshooting)
5. Any feature in code missing from outline → add section or explicit "not exposed in UI" note

Do not write prose yet.
```

---

## 5. Section writing (per chapter)

```text
Write docs/[PATH].md for [SECTION_NAME].

Audience: end users, not developers.
Sources: [list specific .tsx/.go files]
Must include:
- Overview table "what this area does"
- Navigation path from sidebar
- Every control with exact UI label in bold
- Settings table (field | description | default/notes)
- Numbered workflows
- Cross-links to related manual pages
- Admonitions for warnings (data loss, emergency, disabled component)
- Troubleshooting subsection or link

Follow writing-style-guide.md in the comprehensive-user-docs skill.
```

---

## 6. Deployment prompt

```text
Add GitHub Pages deployment for the manual:
- mkdocs.yml at repo root, docs_dir: docs
- requirements-docs.txt with mkdocs-material
- .github/workflows/docs.yml on push to master (paths: docs/**, mkdocs.yml)
- Preserve [EXISTING_PAGES_ARTIFACT e.g. stable/update.json] on doc-only deploys
- Extend [release.yml] to bundle docs into pages artifact if releases already deploy Pages
- Link manual URL in README.md
- Verify with: pip install -r requirements-docs.txt && mkdocs build
```

---

## 7. Quality review prompt

```text
Review the user manual against the codebase:
1. Open [AppShell or router] — is every nav item documented?
2. Open [Settings types] — is every field documented?
3. Open [install scripts] — do commands match?
4. Run mkdocs build — fix broken links
5. List any undocumented user-visible strings found in grep

Output: gap list with file:line references and suggested doc section.
```

---

## 8. User iteration prompts (after first draft)

```text
Add a Troubleshooting section entry for every error banner string and status message in [error handling file / hook].
```

```text
Expand installation docs to match every row in the release workflow asset table.
```

```text
Document keyboard shortcuts from [component] and party/emergency interactions.
```

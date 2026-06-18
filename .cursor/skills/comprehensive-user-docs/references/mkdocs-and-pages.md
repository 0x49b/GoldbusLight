# MkDocs Material + GitHub Pages

Standard stack for beautiful, searchable user manuals deployed from `/docs`.

---

## Files to create

```
mkdocs.yml              # site config (repo root)
requirements-docs.txt   # pip deps
docs/
  index.md
  ...                   # manual pages
.github/workflows/
  docs.yml              # deploy on push to master
```

---

## `requirements-docs.txt`

```text
mkdocs>=1.6,<2
mkdocs-material>=9.5,<10
```

Pin upper bounds to avoid surprise major upgrades.

---

## `mkdocs.yml` essentials

```yaml
site_name: [Product Name]
site_description: User manual for [product]
site_url: https://[user].github.io/[repo]/
repo_url: https://github.com/[user]/[repo]
repo_name: [user]/[repo]

docs_dir: docs

theme:
  name: material
  language: en
  palette:
    - scheme: slate
      primary: deep purple
      accent: amber
      toggle:
        icon: material/brightness-4
        name: Switch to light mode
    - scheme: default
      primary: deep purple
      accent: amber
      toggle:
        icon: material/brightness-7
        name: Switch to dark mode
  features:
    - navigation.tabs
    - navigation.sections
    - navigation.expand
    - navigation.top
    - search.suggest
    - search.highlight
    - content.code.copy
    - toc.follow

nav:
  # ... see doc-outline-template.md

markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences
  - pymdownx.tabbed:
      alternate_style: true
  - pymdownx.highlight:
      anchor_linenums: true
  - tables
  - toc:
      permalink: true

extra:
  social:
    - icon: fontawesome/brands/github
      link: https://github.com/[user]/[repo]
```

Customize `primary` / `accent` to match product branding.

---

## Local commands

```bash
pip install -r requirements-docs.txt
mkdocs serve          # http://127.0.0.1:8000
mkdocs build -d site  # output for CI
```

If `mkdocs` not on PATH after pip: `export PATH="$HOME/.local/bin:$PATH"`

---

## `.github/workflows/docs.yml`

```yaml
name: Deploy documentation

on:
  push:
    branches: [master]
    paths:
      - "docs/**"
      - "mkdocs.yml"
      - "requirements-docs.txt"
      - ".github/workflows/docs.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install MkDocs
        run: pip install -r requirements-docs.txt

      - name: Build documentation site
        run: mkdocs build -d site

      - name: Preserve existing Pages artifacts
        env:
          PAGES_URL: https://[user].github.io/[repo]/[path/to/existing/file.json]
        run: |
          mkdir -p site/[path/to/dir]
          curl -fsSL "$PAGES_URL" -o site/[path/to/dir]/file.json || true

      - uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Preserve existing Pages content

If releases already publish `stable/update.json` (or similar), **doc-only deploys must not delete it**:

- `curl` the live file into `site/` before `upload-pages-artifact`, OR
- Build docs inside the release workflow and `rsync` into `pages/`

---

## Extend release workflow (optional)

In `build-update-manifest` (or equivalent) job:

```yaml
- uses: actions/checkout@v4

- uses: actions/setup-python@v5
  with:
    python-version: "3.12"

- name: Install MkDocs
  run: pip install -r requirements-docs.txt

# ... build pages/stable/update.json into pages/

- name: Build documentation site into pages artifact
  run: |
    mkdocs build -d pages_docs
    rsync -a pages_docs/ pages/

- uses: actions/upload-pages-artifact@v3
  with:
    path: pages
```

Requires `checkout` in that job so `docs/` is available.

---

## README snippet

```markdown
## User manual

End-user documentation: [Product manual](https://[user].github.io/[repo]/).

Source: [`docs/`](docs/), built with MkDocs. Pushes to `master` deploy via [`.github/workflows/docs.yml`](.github/workflows/docs.yml).
```

---

## Repo settings

After first workflow run:

1. GitHub repo → **Settings** → **Pages**
2. **Source:** GitHub Actions (not "Deploy from branch")
3. Confirm environment `github-pages` exists

---

## Verify CI

- [ ] `mkdocs build` exits 0 locally
- [ ] All `nav` paths exist
- [ ] No broken relative links
- [ ] Workflow has `pages: write` + `id-token: write`
- [ ] `concurrency.group: pages` prevents partial overwrites

---
name: Console filters search
overview: "Port the console search/filters/smart-autoscroll plan into TransportConsolePanel: add a WARNING direction on the Go console bus, then build a bottom toolbar with multi-select direction filters, case-insensitive search, and a scroll-to-bottom control that re-enables autoscroll."
todos:
  - id: warning-direction
    content: Add DirectionWarning + Warning() helper in internal/console/console.go
    status: completed
  - id: toolbar-ui
    content: "Add bottom toolbar: direction Toggle chips, search Input, scroll-to-bottom Button in TransportConsolePanel"
    status: completed
  - id: filter-pipeline
    content: Wire visibleEntries filter/search pipeline + noMatches empty state
    status: completed
  - id: smart-autoscroll
    content: Promote autoScroll to useState; autoscroll on visibleEntries; emphasize scroll-to-bottom when paused
    status: completed
  - id: i18n
    content: Add en/de console locale keys for search, directions, scroll, noMatches
    status: completed
isProject: false
---

# Console search, filters, and smart autoscroll

## Mapping from the Kotlin plan

| Original (Compose) | This repo |
|---|---|
| `ConsoleEntryType` | `direction` string on [`Entry`](internal/console/console.go) (`out` / `in` / `info` / `error`) |
| `ConsoleView.kt` | [`TransportConsolePanel.tsx`](frontend/src/components/settings/tabs/TransportConsolePanel.tsx) |
| Detached mode | Already reuses the same panel in [`App.tsx`](frontend/src/App.tsx) (`?view=console-window`) — no detach wiring changes |

Partial smart autoscroll already exists (pause when scrolled >32px from bottom). This plan completes it with filters, search, a scroll-to-bottom button, and `WARNING`.

## 1. Add WARNING direction

In [`internal/console/console.go`](internal/console/console.go):

- Add `DirectionWarning = "warning"`
- Add `func (b *Bus) Warning(...)` mirroring `Error(...)`
- No publisher call-site changes in this pass

Frontend badge in `DIRECTION_BADGE_CLASS`: amber/secondary styling distinct from `error` (destructive) and `info` (muted).

## 2. Bottom toolbar in TransportConsolePanel

Keep the existing top header (title, Detach, Clear). Under the log scroller, add a bottom bar:

```
[ Toggle chips: INFO OUT IN WARNING ERROR ]  [ Search input ]  [ Scroll-to-bottom ]
```

- **Filter chips**: shadcn [`Toggle`](frontend/src/components/ui/toggle.tsx) (`variant="outline"` `size="sm"`) for each direction. Multi-select via `Set<string>`: empty set = show all.
- **Search**: [`Input`](frontend/src/components/ui/input.tsx) with i18n placeholder. Case-insensitive match against `summary`, `detail`, `target`, `direction`, and transport label/raw value.
- **Scroll-to-bottom**: icon `Button` (`ArrowDownToLine` from lucide-react) — scrolls to bottom and sets `autoScrollEnabled = true`. Emphasize (e.g. default variant / visible) when autoscroll is paused.

Local React state only (`useState`) — do not put filters/search on the store or Go bus.

## 3. Filter + search pipeline

```tsx
const visibleEntries = useMemo(() => {
  const q = query.trim().toLowerCase();
  return orderedEntries.filter((entry) => {
    if (selectedTypes.size > 0 && !selectedTypes.has(entry.direction)) return false;
    if (!q) return true;
    // match summary, detail, target, direction, transport
    ...
  });
}, [orderedEntries, selectedTypes, query, t]);
```

Render `visibleEntries` in the list (still keyed by `entry.id`).

Empty states:

- `orderedEntries.length === 0` → existing `console.noActivity`
- entries exist but `visibleEntries.length === 0` → new `console.noMatches`

## 4. Smart autoscroll upgrades

Current behavior in [`TransportConsolePanel.tsx`](frontend/src/components/settings/tabs/TransportConsolePanel.tsx) (lines 43–67):

- `autoScrollRef` + scroll on `orderedEntries.length` change
- `handleScroll` pauses when >32px from bottom

Change to:

- Promote to `useState` for `autoScrollEnabled` so the scroll-to-bottom button can re-render when paused (keep the same 32px threshold on `onScroll`)
- Autoscroll effect depends on `visibleEntries` (length / last id), not raw `orderedEntries.length`
- When filters/search shrink the list: stay put unless autoscroll is on
- Scroll-to-bottom button: `setAutoScrollEnabled(true)` + `el.scrollTop = el.scrollHeight`

## 5. i18n

Add keys under `console` in [`frontend/src/locales/en/settings.json`](frontend/src/locales/en/settings.json) and [`frontend/src/locales/de/settings.json`](frontend/src/locales/de/settings.json):

- `searchPlaceholder`, `scrollToBottom`, `noMatches`
- `directions.info|out|in|warning|error` for chip labels (uppercase display via CSS is fine)

## 6. Files to touch

- [`internal/console/console.go`](internal/console/console.go) — `DirectionWarning` + `Warning()`
- [`frontend/src/components/settings/tabs/TransportConsolePanel.tsx`](frontend/src/components/settings/tabs/TransportConsolePanel.tsx) — toolbar, filter/search, smart scroll, WARNING badge
- [`frontend/src/locales/en/settings.json`](frontend/src/locales/en/settings.json) / [`de/settings.json`](frontend/src/locales/de/settings.json)

No new tests (no existing console UI tests). Skip Wails binding regen — direction is a free-form string.

## Out of scope

- Search next/prev, scroll-to-top, export
- Migrating publishers to emit `warning`
- Persisting filter/search across detach/reopen (local UI state resets; both windows still share live log data via polling)

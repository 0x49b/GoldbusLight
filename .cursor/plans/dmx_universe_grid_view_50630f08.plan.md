---
name: DMX Universe Grid View
overview: Replace the placeholder [`DMXUniverseView`](frontend/src/components/dmx/DMXUniverseView.tsx) with a 24-column × 512-channel grid that shows empty channels as small cells and renders each fixture as one or more merged spans (matching your screenshot), driven by existing `DMXFixture` data from `dmxState.fixtures`.
todos:
  - id: helpers
    content: Add `dmxUniverseGrid.ts` with footprint, universe range, and row segmentation for 24-column grid
    status: completed
  - id: universe-view
    content: Build `DMXUniverseView` grid UI (header, 512 cells, fixture spans, overlap handling, optional click → fixture route)
    status: completed
  - id: app-wire
    content: Pass `dmxState` / USB device list / `setRoute` from `App.tsx` into `DMXUniverseView`
    status: completed
isProject: false
---

# DMX Universe channel grid

## Data model (already in the app)

- Each [`DMXFixture`](frontend/src/types/controller.ts) has `dmxAddress` (universe start, 1–512) and `channels`, where each [`DMXChannel`](frontend/src/types/controller.ts) has a **fixture-relative offset** `channel` (same semantics as in [`DMXFixtureEditorView`](frontend/src/components/dmx/DMXFixtureEditorView.tsx): universe slot = `dmxAddress + offset − 1`).
- **Footprint width**: `footprint = max(offset)` over `fixture.channels`, or `1` if the list is empty (edge case).
- **Universe range**: slots `start = dmxAddress` through `end = min(dmxAddress + footprint − 1, 512)` so patches near the end of the universe clip correctly.

## Layout strategy

- **Grid**: fixed **24 columns**, row-major channel order (001–024 on row 1, etc.), same as your reference. Total cells **512** (last row is partial: 8 cells for 505–512).
- **Empty channels**: one small rounded cell per free slot with zero-padded labels (`001` … `512`), muted background (`bg-muted` / ~`#F2F2F2` in light theme).
- **Fixture blocks**: for each fixture, split `[start, end]` into **horizontal segments per row** (when a range wraps past column 24). Each segment is one rounded rectangle spanning `grid-column` / `grid-row` in the same CSS grid as the cells, with label “start address” and fixture `name` (and optional small conflict indicator).
  - This avoids impossible single-rectangle spans when a fixture wraps to the next row (L-shaped channel ranges).
- **Z-order**: render free channel cells first, then fixture spans with `z-index` above; optionally `pointer-events` on spans for navigation (below).
- **Overlaps**: if two fixtures claim the same slot, keep both segments visible and add a short visual cue (e.g. `border-destructive` or a tiny warning icon in the label area). Deterministic paint order: sort by `dmxAddress` then `id`.

## UI chrome (aligned with screenshot, scoped to one universe)

- Header row: **“Universe 1”** style label; subtitle from the selected USB DMX interface: resolve `dmxState.selectedUSBDeviceId` against [`usbSerialDevices`](frontend/src/types/controller.ts) (use `name` or `description`, fallback `"No USB device selected"`).
- **No second universe**: omit the “+” tab or show a disabled control with title “Only one universe supported” so the UI does not imply multi-universe yet.

## Wiring

- Update [`App.tsx`](frontend/src/App.tsx) where `route.kind === "dmxUniverse"` to pass props into `DMXUniverseView`, e.g. `fixtures={app.dmxState.fixtures}`, `selectedUSBDeviceId={app.dmxState.selectedUSBDeviceId}`, `usbSerialDevices={app.usbSerialDevices}`, `setRoute={app.setRoute}` so users can click a fixture span to open `{ kind: "dmxFixture", id }` (optional but low-cost UX).

## Code organization

- Add a small pure helper module, e.g. [`frontend/src/lib/dmxUniverseGrid.ts`](frontend/src/lib/dmxUniverseGrid.ts):
  - `footprint(fixture)`, `universeRange(fixture)`, `channelIndexToCell(ch, cols=24)`, `splitRangeIntoSegments(start, end, cols)` returning `{ row, colStart, span }[]`.
- Implement the presentational grid in [`DMXUniverseView.tsx`](frontend/src/components/dmx/DMXUniverseView.tsx): full-width content (drop the current `max-w-2xl` “Coming soon” card), use Tailwind + existing design tokens for light-blue fixture panels (`bg-primary/10`, `border-primary/30`, `text-primary`) so light/dark themes stay coherent—tuned to resemble your reference without hard-coding one-off hex unless you prefer exact brand colors.

## Testing / manual checks

- One fixture at address 1 with 16 channel rows → single blue bar across columns 1–16 of row 1; cells 17+ show as grey numbers.
- Fixture whose range crosses row boundary → two (or more) segments, each rectangular.
- Two fixtures with overlapping addresses → both visible + conflict styling.
- Fixture with `dmxAddress` near 512 → clipped span and no overflow past 512.

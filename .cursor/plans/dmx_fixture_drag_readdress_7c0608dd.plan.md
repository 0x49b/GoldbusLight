---
name: DMX Fixture Drag Readdress
overview: Add drag-and-drop readdressing to the DMX universe grid so dropping a fixture updates its start address and automatically pushes overlapping fixtures forward without overlap. Reject drops that would overflow beyond address 512.
todos:
  - id: add-readdress-callback
    content: Add multi-fixture readdress callback in useControllerApp using UpdateDMXFixture + pullDMXState
    status: completed
  - id: wire-props
    content: Pass new callback from App to DMXUniverseView
    status: completed
  - id: implement-dnd-ui
    content: Add draggable fixture blocks, drop targets, and drag hover state in DMXUniverseView
    status: completed
  - id: resolve-collisions
    content: Implement forward chain-push algorithm with overflow rejection using fixture footprints
    status: completed
  - id: status-and-guardrails
    content: Add success/error status messages and preserve click behavior when not dragging
    status: completed
  - id: verify
    content: Run lint/TS checks for touched frontend files and smoke-test expected drag cases
    status: completed
isProject: false
---

# DMX Universe Drag-and-Drop Readdress Plan

## Goal
Implement drag-and-drop in the universe grid so a fixture can be moved by dropping it onto a channel cell, with collision resolution by forward chain-push and hard rejection when the chain cannot fit in 1–512.

## Files to change
- [frontend/src/components/dmx/DMXUniverseView.tsx](/Users/florianthievent/workspace/private/GoldbusLight/frontend/src/components/dmx/DMXUniverseView.tsx)
- [frontend/src/App.tsx](/Users/florianthievent/workspace/private/GoldbusLight/frontend/src/App.tsx)
- [frontend/src/hooks/useControllerApp.ts](/Users/florianthievent/workspace/private/GoldbusLight/frontend/src/hooks/useControllerApp.ts)
- [frontend/src/lib/dmxUniverseGrid.ts](/Users/florianthievent/workspace/private/GoldbusLight/frontend/src/lib/dmxUniverseGrid.ts) (reuse `footprint`/`universeRange`; add helper only if needed)

## Implementation approach
- Add a new app-level callback exposed from `useControllerApp` (e.g. `onReaddressDMXFixtures`) that accepts a list of `{id, dmxAddress}` updates and persists them by calling `UpdateDMXFixture` for each affected fixture, then refreshes DMX state once.
- Thread this callback into `DMXUniverseView` via `App.tsx` as a new prop.
- In `DMXUniverseView`, implement HTML5 drag-and-drop:
  - Make fixture blocks draggable.
  - Track dragged fixture id and hovered target channel.
  - Allow dropping on free cells and fixture blocks (use segment start channel to map to a valid target slot).
- Compute drop result with deterministic forward chain-push:
  - Keep dragged fixture fixed at dropped start address.
  - Sort remaining fixtures by current start address, then for each fixture that overlaps with already placed ones, move it to the first free slot after the blocking range.
  - Preserve each fixture footprint from `footprint(fixture)` and ensure `start + footprint - 1 <= 512`.
  - If any fixture cannot fit, reject drop and return without updates.
- Persist only fixtures whose addresses changed; then reload and clear drag UI state.

## UX/feedback
- Show a temporary status/error via existing app status pipeline:
  - Success: moved fixture + number of shifted fixtures.
  - Rejected: drop cannot fit in universe (overflow to >512).
- Add subtle hover/drop-target styling so users see where the fixture will land.

## Validation checklist
- Drag to empty gap updates only dragged fixture.
- Drag onto occupied area shifts later fixtures forward in chain, no overlaps remain.
- Drop that would overflow to >512 is rejected and keeps original layout.
- Fixture click-to-open still works when not dragging.
- No TypeScript/lint errors in modified files.
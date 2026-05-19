---
name: split fixture previews
overview: Refactor the DMX 3D preview into a reusable parent shell plus separate moving-head and smoke preview implementations, keeping the current live-controls behavior intact and making future fixture preview types easier to add.
todos:
  - id: extract-parent
    content: Refactor `DMXFixturePreview3D.tsx` into a parent Canvas/interaction shell that dispatches by `variant`.
    status: completed
  - id: extract-moving-head
    content: Move moving-head mesh, arm/head articulation, and beam cone behavior into `DMXMovingHeadPreview3D.tsx`.
    status: completed
  - id: extract-smoke
    content: Move smoke mesh loading and plume particle behavior into `DMXSmokePreview3D.tsx`.
    status: completed
  - id: share-helpers
    content: Extract only genuinely shared helpers/types into a small shared module if needed.
    status: completed
  - id: verify-preview-split
    content: Check lints/build and manually verify moving-head and smoke previews still behave the same.
    status: completed
isProject: false
---

# Split Fixture Preview Plan

## Findings
- This is feasible and fairly low risk: [frontend/src/components/dmx/DMXFixturePreview3D.tsx](frontend/src/components/dmx/DMXFixturePreview3D.tsx) already separates behavior with `variant === "movingHead"` / `variant === "smoke"`, but the mesh loading, scene shell, drag handling, beam logic, and smoke particle logic are all in one file.
- The only current renderer call site is [frontend/src/components/dmx/DMXFixtureLiveControls.tsx](frontend/src/components/dmx/DMXFixtureLiveControls.tsx), where it passes `variant`, pan/tilt, beam props, smoke intensity, and drag callback.
- Existing meshes are only [frontend/public/meshes/moving_head.dae](frontend/public/meshes/moving_head.dae) and [frontend/public/meshes/smoke.dae](frontend/public/meshes/smoke.dae), so the first split can stay focused on these two without changing fixture data models.

## Proposed Structure
- Keep [frontend/src/components/dmx/DMXFixturePreview3D.tsx](frontend/src/components/dmx/DMXFixturePreview3D.tsx) as the parent/dispatcher component for API stability:
  - shared outer `<div>` styling
  - `<Canvas>`, camera, lights, `Suspense`, and `OrbitControls`
  - shared pan/tilt pointer-drag handling for moving-head previews
  - `variant` switch to render the fixture-specific child component
- Add [frontend/src/components/dmx/DMXMovingHeadPreview3D.tsx](frontend/src/components/dmx/DMXMovingHeadPreview3D.tsx):
  - moving-head Collada load from `/meshes/moving_head.dae`
  - `arm` / `head` node lookup and rest-pose rotation logic
  - beam cone creation, focus aperture, color/rainbow updates
- Add [frontend/src/components/dmx/DMXSmokePreview3D.tsx](frontend/src/components/dmx/DMXSmokePreview3D.tsx):
  - smoke Collada load from `/meshes/smoke.dae`
  - `emitter` node lookup
  - smoke particle geometry/material and animation
- Add a small shared helper file only if it keeps the split clean, likely [frontend/src/components/dmx/DMXFixturePreview3D.shared.ts](frontend/src/components/dmx/DMXFixturePreview3D.shared.ts), for:
  - `clamp01`, `degToRad`, `applyOpacity`
  - Collada scene clone/normalize helper if both children need it
  - shared preview prop types if importing from the parent would create awkward dependencies

## Implementation Notes
- Keep `DMXFixturePreview3DProps` compatible so [frontend/src/components/dmx/DMXFixtureLiveControls.tsx](frontend/src/components/dmx/DMXFixtureLiveControls.tsx) should need little or no behavioral change.
- Move fixture-specific constants with their fixture component: beam constants into `DMXMovingHeadPreview3D`, smoke particle constants into `DMXSmokePreview3D`.
- Keep the parent responsible for future extension by making the variant switch explicit; later fixture types can add another child component without growing the moving-head or smoke files.
- Preserve current interaction rules: moving heads are draggable when enabled, smoke previews are orbit-rotatable and not pan/tilt draggable.

```mermaid
flowchart TD
    liveControls["DMXFixtureLiveControls"] --> parentPreview["DMXFixturePreview3D parent"]
    parentPreview --> sharedShell["Canvas, lights, drag, controls"]
    parentPreview --> movingHead["DMXMovingHeadPreview3D"]
    parentPreview --> smokePreview["DMXSmokePreview3D"]
    sharedHelpers["Shared helpers"] --> movingHead
    sharedHelpers --> smokePreview
```

## Verification
- Run `ReadLints` on the edited preview files and [frontend/src/components/dmx/DMXFixtureLiveControls.tsx](frontend/src/components/dmx/DMXFixtureLiveControls.tsx).
- Run `npm run build` in [frontend](frontend) to catch TypeScript/Vite errors.
- Manually verify both preview modes: moving-head pan/tilt drag, beam color/focus/rainbow behavior, and smoke output plume intensity.
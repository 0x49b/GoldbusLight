---
name: Scene reapply and clear
overview: Re-clicking the already-active lighting scene will re-apply it immediately (no confirm dialog). Manual fixture DMX and WLED edits will clear `activeSceneId` on the backend so the Scenes page shows no active scene afterward.
todos:
  - id: reapply-click
    content: "ScenesView: re-apply active standard scene on click without dialog; keep card clickable"
    status: completed
  - id: backend-clear
    content: Clear activeSceneID in SetDeviceState, SetGlobalState, ApplyDMXLivePatch (on real changes) + helper
    status: completed
  - id: frontend-sync
    content: Sync snapshot activeSceneId after DMX/WLED manual edits (and optionally on Scenes navigation)
    status: completed
  - id: tests
    content: "Add controller tests: manual edit clears active scene; ApplyLightingScene still sets it"
    status: completed
isProject: false
---

# Scene re-apply without confirm + clear on manual edits

## Current behavior

- Active standard scene cards are **disabled** and [`requestActivateScene`](frontend/src/components/scenes/ScenesView.tsx) early-returns when `activeSceneId === scene.id` — re-click does nothing.
- Confirmation only runs when activating a **different** scene.
- `activeSceneId` lives on the Go controller ([`internal/controller/controller.go`](internal/controller/controller.go)), set by [`ApplyLightingScene`](internal/controller/scenes.go). Manual edits via `SetDeviceState` / `SetGlobalState` / `ApplyDMXLivePatch` do **not** clear it.

Party scene while running stays inert (party clears `activeSceneId` already); this change targets standard scenes only.

## 1. Re-apply active scene without confirmation (frontend)

In [`ScenesView.tsx`](frontend/src/components/scenes/ScenesView.tsx):

- In `requestActivateScene`, when `activeSceneId === scene.id` (and not already applying): call `onApply(id)` immediately — same path as `confirmActivateScene` for standard scenes — **skip** `setPendingActivateId`.
- Keep the confirm dialog for switching to a different scene / starting party.
- Stop treating “current standard scene” as disabled so the card remains clickable; still disable while `busy` / `applyingId` / party start, and keep the party card disabled while party is running:

```ts
const disabled =
  busy || isBusyActivating || (isPartyScene && isCurrent) || applyingId != null || startingParty;
```

Visual “active” styling (`aria-pressed`, border) stays as today.

## 2. Clear active scene on manual fixture / WLED changes (backend)

Add a small helper on `WLEDController` (e.g. in [`scenes.go`](internal/controller/scenes.go)):

```go
// clearActiveSceneLocked clears activeSceneID if set. Caller must hold c.mu.
func (c *WLEDController) clearActiveSceneLocked() bool { ... }
```

Call it when a real user-driven light mutation succeeds:

| Path | When to clear |
|------|----------------|
| [`SetDeviceState`](internal/controller/controller.go) | After a non-no-op apply, under the existing write lock (before `persist`) |
| [`SetGlobalState`](internal/controller/controller.go) | Under the existing write lock after applying to devices |
| [`ApplyDMXLivePatch`](internal/controller/controller.go) | When `changedCount > 0`: lock `c.mu`, clear if set, unlock; **persist only if cleared** (live patches do not persist today) |

`ApplyLightingScene` already applies via those APIs **then** sets `activeSceneID = scene.ID`. Transient clear mid-apply is fine; the final assign restores the correct ID. Companion HTTP and Wails share the same controller methods, so both stay consistent.

Do **not** add a separate public clear API unless tests need it.

## 3. Keep Scenes UI in sync (frontend)

Backend clear alone is not enough for DMX live patches: [`flushDmxLivePatch`](frontend/src/hooks/useControllerApp.ts) does not `pullSnapshot`, and navigating to Scenes does not refresh either.

- After a successful `ApplyDMXLivePatch` in `flushDmxLivePatch`, clear `activeSceneId` on the local snapshot (or `pullSnapshot` if simpler / already cheap enough).
- For WLED: `onSetDeviceState` already `pullSnapshot()`s after success (non-skip path). Also clear `activeSceneId` on the optimistic/local snapshot for the auto-apply path that uses `skipFollowupDetailReload`.
- Mirror the same local clear in `onSetGlobalState` if it patches snapshot without a full pull that includes `activeSceneId`.

Optional hardening: when route becomes `scenes`, call `pullSnapshot()` once so companion-driven edits also show correctly when returning to the page.

## 4. Tests

Extend [`internal/controller/scenes_test.go`](internal/controller/scenes_test.go) (or nearby controller tests):

- Apply a scene → `activeSceneId` set → `SetDeviceState` / live patch with a real change → `activeSceneId` empty.
- Apply scene still ends with `activeSceneId` set after going through preset/patch apply (regression).

## Out of scope

- Re-clicking a **running** party scene (stays no-op / disabled).
- Emergency stop as a separate clear path (covered only if it already goes through `ApplyDMXLivePatch`).
- Docs/handout wording unless you want a follow-up for the “always confirm” step.
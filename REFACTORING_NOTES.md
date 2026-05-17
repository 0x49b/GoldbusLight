# Refactoring Notes

This document tracks the refactoring work completed on the GoldbusLight codebase.

## Completed Refactorings

### 1. Service Layer Boilerplate Elimination ✅

**File**: `internal/service/goldbuslightservice.go`

**Problem**: Every service method repeated the same `requireController()` boilerplate 25 times, resulting in ~75 lines of duplicate code.

**Solution**: Created generic helper functions using Go generics:
- `withController(fn)` - for methods returning just `error`
- `withControllerResult[T](fn)` - for methods returning `(T, error)`
- `withControllerValue[T](fn)` - for methods returning a value from controller without error

**Example Before**:
```go
func (g *GoldbusLightService) GetControllerSnapshot() (ctrlpkg.ControllerSnapshot, error) {
    controller, err := g.requireController()
    if err != nil {
        return ctrlpkg.ControllerSnapshot{}, err
    }
    return controller.Snapshot(), nil
}
```

**Example After**:
```go
func (g *GoldbusLightService) GetControllerSnapshot() (ctrlpkg.ControllerSnapshot, error) {
    return withControllerValue(g, func(c *ctrlpkg.WLEDController) ctrlpkg.ControllerSnapshot {
        return c.Snapshot()
    })
}
```

**Impact**:
- Eliminated 75+ lines of boilerplate
- Consistent error handling across all methods
- Easier to add new service methods

---

### 2. Timeout Constants Extraction ✅

**File**: `internal/service/goldbuslightservice.go`

**Problem**: Timeout values (5s, 8s, 10s, 20s) were hardcoded throughout the service layer with no documentation about why different operations have different timeouts.

**Solution**: Created named constants at the package level:
```go
const (
    TimeoutNetworkApply  = 20 * time.Second  // Network operations need more time
    TimeoutDiscovery     = 10 * time.Second  // Device discovery can be slow
    TimeoutDeviceOp      = 5 * time.Second   // Standard device operations
    TimeoutDeviceDetail  = 8 * time.Second   // Fetching device details
    TimeoutProvision     = 8 * time.Second   // Device provisioning
)
```

**Usage Example**:
```go
ctx, cancel := context.WithTimeout(context.Background(), TimeoutDeviceOp)
defer cancel()
```

**Impact**:
- All timeouts in one place, easy to adjust
- Self-documenting code
- Consistent timeout strategy

---

### 3. Frontend Hook Splitting (Partial) ✅

**Files Created**:
- `frontend/src/hooks/useDMXController.ts` - 229 lines
- `frontend/src/hooks/useDeviceDetail.ts` - 197 lines

**Problem**: The `useControllerApp` hook was 1502 lines, managing all application state, device operations, DMX, settings, and routing.

**Solution**: Extracted domain-specific hooks that can be composed:

#### useDMXController Hook

Manages all DMX-related functionality:
- DMX fixture CRUD operations
- USB serial device management
- DMX live output control
- Art-Net status monitoring

**Example Usage**:
```typescript
const dmx = useDMXController({
    dmxState,
    usbSerialDevices,
    settings,
    setDMXState,
    setUSBSerialDevices,
    setStatus,
    setError,
    setBusy,
});

// Use DMX operations
await dmx.onCreateDMXFixture(input);
await dmx.startDMXLiveOutput(fixtureID);
dmx.queueDmxLivePatch([{address: 1, value: 255}]);
```

#### useDeviceDetail Hook

Manages device detail fetching with retry logic:
- Automatic retry with exponential backoff
- Background refresh capability
- Cancellable requests
- Offline device detection

**Example Usage**:
```typescript
const detail = useDeviceDetail({
    selectedDevice,
    snapshot,
    deviceDetail,
    deviceDetailInitializing,
    deviceDetailReloading,
    deviceDetailFetchAttempt,
    setSnapshot,
    setDeviceDetail,
    setDeviceDetailInitializing,
    setDeviceDetailReloading,
    setDeviceDetailFetchAttempt,
    setError,
});

// Fetch device detail
await detail.fetchDeviceDetail(deviceID);
// Or reload in background
await detail.reloadDeviceDetail();
```

**Impact**:
- More focused, testable hooks
- Clearer separation of concerns
- Easier to reason about DMX and device detail logic independently

---

## Integration Steps (TODO)

To complete the frontend refactoring, the following steps are needed:

### 1. Update useControllerApp to Use New Hooks

Modify `frontend/src/hooks/useControllerApp.ts` to compose the new hooks:

```typescript
export function useControllerApp() {
    // ... existing store access ...

    // Use DMX hook
    const dmx = useDMXController({
        dmxState,
        usbSerialDevices,
        settings,
        setDMXState,
        setUSBSerialDevices,
        setStatus,
        setError,
        setBusy,
    });

    // Use device detail hook
    const deviceDetailHook = useDeviceDetail({
        selectedDevice,
        snapshot,
        deviceDetail,
        deviceDetailInitializing,
        deviceDetailReloading,
        deviceDetailFetchAttempt,
        setSnapshot,
        setDeviceDetail,
        setDeviceDetailInitializing,
        setDeviceDetailReloading,
        setDeviceDetailFetchAttempt,
        setError,
    });

    // Return composed interface
    return {
        // ... other properties ...
        ...dmx,
        ...deviceDetailHook,
    };
}
```

### 2. Remove Duplicate Code

Once integrated, remove the corresponding code from `useControllerApp.ts`:
- Lines 276-279: DMX refs (moved to useDMXController)
- Lines 335-343: pullDMXState and pullUSBSerialDevices (moved to useDMXController)
- Lines 711-946: All DMX-related callbacks (moved to useDMXController)
- Device detail fetch logic (moved to useDeviceDetail)

### 3. Create Additional Domain Hooks

Consider creating hooks for other domains:

#### usePresets Hook
Manage preset panel state:
- `presetBri`, `presetRgb`
- `generalFx`, `generalPal`, `generalSx`, `generalIx`
- Preset color application (warm white, cold white, named colors)

#### useSettings Hook
Manage settings operations:
- Settings CRUD
- Network apply operations
- State/config payload text management

#### useDeviceList Hook
Manage device list operations:
- Device discovery
- Device filtering (ignored devices)
- Device removal/renaming

### 4. Zustand Store Refactoring

Group related state properties in the Zustand store:

**Before** (48 individual properties):
```typescript
type ControllerStore = {
    generalFx: number;
    generalPal: number;
    generalSx: number;
    generalIx: number;
    // ... 44 more properties
};
```

**After** (grouped state):
```typescript
type GeneralPresetState = {
    fx: number;
    pal: number;
    sx: number;
    ix: number;
};

type DeviceFormState = {
    fx: number;
    pal: number;
    sx: number;
    ix: number;
    bri: number;
    rgb: [number, number, number];
    transition: number;
};

type ControllerStore = {
    generalPresets: GeneralPresetState;
    deviceForm: DeviceFormState;
    // ... other grouped state
};
```

### 5. Component Prop Refactoring

Reduce prop drilling by passing grouped objects:

**Before** (26 props):
```typescript
<DeviceDetailView
    device={device}
    deviceDetail={deviceDetail}
    deviceDetailInitializing={deviceDetailInitializing}
    // ... 23 more props
/>
```

**After** (5 grouped props):
```typescript
<DeviceDetailView
    device={device}
    deviceDetailState={deviceDetailState}
    editingState={editingState}
    formState={formState}
    callbacks={callbacks}
/>
```

---

## Benefits of Completed Refactorings

1. **Maintainability**: Code is easier to understand and modify
2. **Testability**: Smaller, focused hooks are easier to unit test
3. **Reusability**: Extracted hooks can be reused in other components
4. **Performance**: Better separation allows for more targeted optimizations
5. **Developer Experience**: Clearer code structure, less cognitive load

---

## Testing Recommendations

After integration:

1. **Unit Tests**: Add tests for extracted hooks
   - `useDMXController.test.ts`
   - `useDeviceDetail.test.ts`

2. **Integration Tests**: Verify composed hooks work correctly
   - Test DMX operations in context
   - Test device detail fetching with retries

3. **End-to-End Tests**: Ensure UI functionality remains unchanged
   - DMX fixture creation/editing
   - Device detail view operations
   - Preset application

---

## Future Refactoring Opportunities

See the main refactoring analysis for additional opportunities:
1. Lock management inconsistencies in controller
2. Device state update duplication
3. Type safety improvements (reduce `map[string]any` usage)
4. Hardcoded constants documentation
5. Duplicated preset data
6. Missing USB device abstraction

---

## Notes

- The backend refactorings (service layer, timeouts) are complete and ready to use
- The frontend refactorings demonstrate the pattern but require integration
- No breaking changes were introduced - existing code still works
- The refactored code maintains the same public API

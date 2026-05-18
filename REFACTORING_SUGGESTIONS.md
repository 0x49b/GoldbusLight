# GoldbusLight Refactoring Suggestions

This document contains a comprehensive list of refactoring opportunities identified in the codebase, organized by priority and status.

---

## ✅ Completed Refactorings

### 1. Service Layer Boilerplate Elimination ✅ COMPLETED

**Status**: ✅ Done
**File**: `internal/service/goldbuslightservice.go`
**Lines**: Throughout the file
**Priority**: High
**Impact**: High

**Problem**: Every service method repeated the same `requireController()` pattern 25 times, resulting in ~75 lines of duplicate code.

**Solution Implemented**: Created generic helper functions using Go generics:
```go
func withControllerResult[T any](g *GoldbusLightService, fn func(*ctrlpkg.WLEDController) (T, error)) (T, error)
func withControllerValue[T any](g *GoldbusLightService, fn func(*ctrlpkg.WLEDController) T) (T, error)
func (g *GoldbusLightService) withController(fn func(*ctrlpkg.WLEDController) error) error
```

**Benefits**:
- Eliminated 75+ lines of boilerplate
- Consistent error handling
- Easier to add new service methods

---

### 2. Timeout Constants Extraction ✅ COMPLETED

**Status**: ✅ Done
**File**: `internal/service/goldbuslightservice.go`
**Lines**: Various (62, 73, 84, 101, 112, 126, 140, 181)
**Priority**: High
**Impact**: Medium

**Problem**: Timeout durations hardcoded throughout the service layer with no documented rationale.

**Solution Implemented**: Created named constants:
```go
const (
    TimeoutNetworkApply  = 20 * time.Second
    TimeoutDiscovery     = 10 * time.Second
    TimeoutDeviceOp      = 5 * time.Second
    TimeoutDeviceDetail  = 8 * time.Second
    TimeoutProvision     = 8 * time.Second
)
```

**Benefits**:
- Single source of truth for timeouts
- Self-documenting code
- Easy to adjust timeout strategy

---

### 3. Frontend Hook Splitting (Partial) ✅ COMPLETED

**Status**: ✅ Partially done (hooks created, integration pending)
**Files Created**:
- `frontend/src/hooks/useDMXController.ts` (229 lines)
- `frontend/src/hooks/useDeviceDetail.ts` (197 lines)

**File**: `frontend/src/hooks/useControllerApp.ts` (1502 lines)
**Priority**: High
**Impact**: High

**Problem**: Single hook managing all app state, device operations, DMX, settings, routing, etc.

**Solution Implemented**: Extracted domain-specific hooks that can be composed. See `REFACTORING_NOTES.md` for integration steps.

**Benefits**:
- More focused, testable hooks
- Clearer separation of concerns
- Better code organization

---

## 🔴 High Priority Refactorings (Recommended Next)

### 4. Excessive Prop Drilling in DeviceDetailView

**Status**: 🔴 Not Started
**File**: `frontend/src/components/device/DeviceDetailView.tsx`
**Lines**: 73-100+ (type definition), 94-131 in App.tsx (usage)
**Priority**: High
**Impact**: High
**Effort**: Medium

**Problem**: Component receives 26 individual props, making it hard to maintain and reason about.

**Current Situation**:
```typescript
export type DeviceDetailViewProps = {
    device: WLEDDevice | undefined;
    deviceDetail: WLEDDeviceDetail | null;
    deviceDetailInitializing: boolean;
    deviceDetailReloading: boolean;
    deviceDetailFetchAttempt: number;
    deviceDetailFetchMax: number;
    busy: boolean;
    editingDeviceName: boolean;
    setEditingDeviceName: Dispatch<SetStateAction<boolean>>;
    deviceNameDraft: string;
    setDeviceNameDraft: Dispatch<SetStateAction<string>>;
    selectedSegIdx: number;
    setSelectedSegIdx: Dispatch<SetStateAction<number>>;
    deviceFormFx: number;
    setDeviceFormFx: Dispatch<SetStateAction<number>>;
    // ... 12 more props
};
```

**Recommended Solution**:
```typescript
type DeviceDetailLoadingState = {
    detail: WLEDDeviceDetail | null;
    initializing: boolean;
    reloading: boolean;
    fetchAttempt: number;
    fetchMax: number;
};

type DeviceEditingState = {
    isEditing: boolean;
    nameDraft: string;
    setEditing: (editing: boolean) => void;
    setNameDraft: (name: string) => void;
};

type DeviceFormState = {
    segmentIndex: number;
    fx: number;
    pal: number;
    sx: number;
    ix: number;
    rgb: [number, number, number];
    bri: number;
    transition: number;
};

type DeviceFormActions = {
    setSegmentIndex: (idx: number) => void;
    setFx: (fx: number) => void;
    setPal: (pal: number) => void;
    setSx: (sx: number) => void;
    setIx: (ix: number) => void;
    setRgb: (rgb: [number, number, number]) => void;
    setBri: (bri: number) => void;
    setTransition: (transition: number) => void;
};

export type DeviceDetailViewProps = {
    device: WLEDDevice | undefined;
    loadingState: DeviceDetailLoadingState;
    editingState: DeviceEditingState;
    formState: DeviceFormState;
    formActions: DeviceFormActions;
    busy: boolean;
    onStateChange: (deviceID: string, state: JSONMap) => Promise<void>;
    onRefresh: () => Promise<void>;
    onRename: (name: string) => Promise<void>;
};
```

**Benefits**:
- Clearer prop structure
- Easier to understand component dependencies
- Better TypeScript inference
- Simpler to add new related props

---

### 5. Oversized Zustand Store

**Status**: 🔴 Not Started
**File**: `frontend/src/store/controllerStore.ts`
**Lines**: 14-49 (state properties), 50-96 (setters)
**Priority**: High
**Impact**: High
**Effort**: Medium

**Problem**: 48 individual state properties + 48 setters = 96 total. Hard to track state changes and dependencies.

**Current Situation**:
```typescript
type ControllerStore = {
    // 48 individual properties
    generalFx: number;
    generalPal: number;
    generalSx: number;
    generalIx: number;
    deviceFormFx: number;
    deviceFormPal: number;
    deviceFormSx: number;
    deviceFormIx: number;
    // ... 40 more properties

    // 48 individual setters
    setGeneralFx: (fx: number) => void;
    setGeneralPal: (pal: number) => void;
    // ... 46 more setters
};
```

**Recommended Solution**:
```typescript
type GeneralPresetState = {
    bri: number;
    rgb: [number, number, number];
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

type DeviceDetailState = {
    detail: WLEDDeviceDetail | null;
    initializing: boolean;
    reloading: boolean;
    fetchAttempt: number;
    selectedSegIdx: number;
};

type EditingState = {
    editingDeviceName: boolean;
    deviceNameDraft: string;
};

type ControllerStore = {
    // Core state
    snapshot: ControllerSnapshot | null;
    settings: ControllerSettings | null;
    route: Route;
    status: string;
    error: string | null;
    busy: boolean;
    discovering: boolean;

    // Grouped domain state
    generalPresets: GeneralPresetState;
    deviceForm: DeviceFormState;
    deviceDetail: DeviceDetailState;
    editing: EditingState;
    dmxState: DMXState;

    // Grouped setters
    setGeneralPresets: (state: Partial<GeneralPresetState>) => void;
    setDeviceForm: (state: Partial<DeviceFormState>) => void;
    setDeviceDetail: (state: Partial<DeviceDetailState>) => void;
    setEditing: (state: Partial<EditingState>) => void;

    // Core setters
    setSnapshot: (snapshot: ControllerSnapshot | null) => void;
    setSettings: (settings: ControllerSettings | null) => void;
    setRoute: (route: Route) => void;
    // ... etc
};
```

**Benefits**:
- Clearer state organization
- Fewer action methods
- Better encapsulation of related state
- Easier to reason about state updates

---

### 6. Lock Management Inconsistencies

**Status**: 🔴 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 1435-1455, 1470-1488, 1083-1116
**Priority**: High
**Impact**: Medium
**Effort**: Medium

**Problem**: Multiple patterns of acquiring/releasing locks with inconsistent usage. Some methods use defer, others manually unlock in error paths, some hold locks during I/O.

**Example Issue (Lines 1435-1455)**:
```go
c.mu.Lock()
idx := -1
for i := range c.dmxState.Fixtures {
    if c.dmxState.Fixtures[i].ID == id {
        idx = i
        break
    }
}
if idx < 0 {
    c.mu.Unlock()  // Manual unlock before return - inconsistent
    return DMXFixture{}, fmt.Errorf("unknown fixture: %s", id)
}
// ... more logic
c.mu.Unlock()
```

**Recommended Solution**:

1. **Always use defer for locks**:
```go
c.mu.Lock()
defer c.mu.Unlock()

idx := -1
for i := range c.dmxState.Fixtures {
    if c.dmxState.Fixtures[i].ID == id {
        idx = i
        break
    }
}
if idx < 0 {
    return DMXFixture{}, fmt.Errorf("unknown fixture: %s", id)
}
// ... more logic
```

2. **Extract lock patterns into helpers**:
```go
// Helper for read-only operations
func (c *WLEDController) withDeviceLocked(deviceID string, fn func(device WLEDDevice) error) error {
    c.mu.Lock()
    defer c.mu.Unlock()

    device, ok := c.devices[deviceID]
    if !ok {
        return fmt.Errorf("unknown device: %s", deviceID)
    }
    return fn(device)
}

// Helper for mutation operations
func (c *WLEDController) updateDeviceLocked(deviceID string, updater func(*WLEDDevice) error) error {
    c.mu.Lock()
    defer c.mu.Unlock()

    device, ok := c.devices[deviceID]
    if !ok {
        return fmt.Errorf("unknown device: %s", deviceID)
    }
    if err := updater(&device); err != nil {
        return err
    }
    c.devices[deviceID] = device
    c.updated = time.Now()
    return nil
}
```

**Benefits**:
- Consistent lock management
- Reduced risk of deadlocks
- Clearer critical sections
- Easier to audit for race conditions

---

## 🟡 Medium Priority Refactorings

### 7. Device State Update Duplication

**Status**: 🟡 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 1100-1116 (SetDeviceState), 1226-1241 (RefreshDevice), 1150-1157 (SetGlobalState)
**Priority**: Medium
**Impact**: Medium
**Effort**: Low

**Problem**: Device update pattern duplicated across multiple methods.

**Repeated Pattern**:
```go
c.mu.Lock()
device.LastSeen = time.Now()
device.Online = true
if device.Info == nil {
    device.Info = map[string]any{}
}
for k, v := range state {
    if k == "on" || k == "bri" || k == "ps" {
        device.Info[k] = v
    }
}
device.LastState = mergeStateIntoLastState(device.LastState, state)
c.devices[deviceID] = device
c.updated = time.Now()
c.mu.Unlock()
```

**Recommended Solution**:
```go
// Extract to helper method
func (c *WLEDController) updateDeviceWithState(device WLEDDevice, state map[string]any) WLEDDevice {
    device.LastSeen = time.Now()
    device.Online = true
    if device.Info == nil {
        device.Info = map[string]any{}
    }
    for k, v := range state {
        if k == "on" || k == "bri" || k == "ps" {
            device.Info[k] = v
        }
    }
    device.LastState = mergeStateIntoLastState(device.LastState, state)
    return device
}

// Usage
func (c *WLEDController) SetDeviceState(ctx context.Context, deviceID string, state map[string]any) error {
    // ... HTTP call ...

    c.mu.Lock()
    device := c.devices[deviceID]
    device = c.updateDeviceWithState(device, state)
    c.devices[deviceID] = device
    c.updated = time.Now()
    c.mu.Unlock()

    return nil
}
```

**Benefits**:
- DRY principle
- Single source of truth for device updates
- Easier to modify update logic

---

### 8. Asymmetric Error Handling for Persistence

**Status**: 🟡 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 1162-1167, 1026, 1028
**Priority**: Medium
**Impact**: Medium
**Effort**: Low

**Problem**: Inconsistent policy on whether persistence failures are fatal. Some methods log and continue, others propagate errors.

**Example Inconsistency**:
```go
// SetGlobalState - logs but doesn't return error
if err := c.generalTabPersistence.Save(c.generalTabState); err != nil {
    c.logger.Printf("persist general tab state failed: %v", err)
}
if err := c.persist(); err != nil {
    c.logger.Printf("persist after global state failed: %v", err)
}

// SaveSettings - returns persistence error
func (c *WLEDController) SaveSettings(settings ControllerSettings) error {
    // ...
    return c.persist() // Error propagated to caller
}
```

**Recommended Solution**:

1. **Establish clear policy**:
   - Critical operations (SaveSettings, user-initiated saves): return errors
   - Background/automatic saves: log with warning level

2. **Create helper for non-critical persistence**:
```go
// For operations where persistence failure shouldn't stop the primary operation
func (c *WLEDController) persistWithLogging(data interface{}, description string) {
    if err := c.persist(); err != nil {
        c.logger.Printf("WARNING: failed to persist %s: %v", description, err)
    }
}

// Usage
func (c *WLEDController) SetGlobalState(ctx context.Context, state map[string]any) map[string]string {
    // ... primary operation ...

    c.persistWithLogging(c.generalTabState, "general tab state")
    return results
}
```

**Benefits**:
- Clear contract on error handling
- Explicit about when persistence matters
- Better user experience (don't fail operations due to disk issues)

---

### 9. Overly Broad map[string]any Usage

**Status**: 🟡 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 113, 115 (WLEDDevice), 528-533 (WLEDDeviceDetail), 62-63 (ProvisioningSettings)
**Priority**: Medium
**Impact**: Medium
**Effort**: High

**Problem**: Excessive use of `map[string]any` reduces type safety. Properties like "on", "bri", "seg" accessed with string literals throughout code.

**Current Situation**:
```go
type WLEDDevice struct {
    ID        string         `json:"id"`
    Info      map[string]any `json:"info,omitempty"`      // Untyped
    LastState map[string]any `json:"lastState,omitempty"` // Untyped
    // ...
}

// Accessing fields with magic strings (Lines 578-580, 1107-1109)
if on, ok := state["on"].(bool); ok {
    device.Info["on"] = on
}
if bri, ok := state["bri"].(float64); ok {
    device.Info["bri"] = int(bri)
}
```

**Recommended Solution**:

1. **Create typed wrappers for common WLED state**:
```go
type WLEDState struct {
    On         *bool      `json:"on,omitempty"`
    Bri        *int       `json:"bri,omitempty"`
    PS         *int       `json:"ps,omitempty"`
    Seg        []Segment  `json:"seg,omitempty"`
    Transition *int       `json:"transition,omitempty"`
    // Keep for unknown fields
    Extra      map[string]any `json:"-"`
}

type Segment struct {
    ID   int              `json:"id"`
    Fx   *int             `json:"fx,omitempty"`
    Pal  *int             `json:"pal,omitempty"`
    Sx   *int             `json:"sx,omitempty"`
    Ix   *int             `json:"ix,omitempty"`
    Col  [][]int          `json:"col,omitempty"`
    Extra map[string]any  `json:"-"`
}

type WLEDDevice struct {
    ID        string      `json:"id"`
    Info      *WLEDState  `json:"info,omitempty"`
    LastState *WLEDState  `json:"lastState,omitempty"`
    // ...
}
```

2. **Add marshal/unmarshal helpers**:
```go
func (w *WLEDState) UnmarshalJSON(data []byte) error {
    var raw map[string]any
    if err := json.Unmarshal(data, &raw); err != nil {
        return err
    }

    // Extract known fields
    if v, ok := raw["on"].(bool); ok {
        w.On = &v
    }
    if v, ok := raw["bri"].(float64); ok {
        i := int(v)
        w.Bri = &i
    }
    // ... more fields

    // Store unknown fields
    delete(raw, "on")
    delete(raw, "bri")
    // ... delete known fields
    w.Extra = raw

    return nil
}
```

**Benefits**:
- Type safety for common fields
- Better IDE autocomplete
- Compile-time error checking
- Still flexible for unknown/dynamic fields

---

### 10. Hardcoded Constants Without Documentation

**Status**: 🟡 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 1521, 1522, 1666, 1933, 1945, 35
**Priority**: Medium
**Impact**: Low
**Effort**: Low

**Problem**: Magic numbers scattered without explanation.

**Examples**:
```go
const dmxLiveFrameHz = 44               // Line 1521 - Why 44Hz?
const dmxAdapterQueueDepth = 2          // Line 1522 - Why 2 channels?
BaudRate: 250000                        // Line 1666 - Hardcoded baud rate
const ttl = 8 * time.Second             // Line 1933 - Why 8 seconds?
if len(c.probeRecent) > 384 {           // Line 1945 - Why 384 entries?
ap24MaxChannel     = 14                 // Line 35 - No explanation
```

**Recommended Solution**:
```go
const (
    // DMXLiveFrameHz is the refresh rate for DMX output.
    // Standard DMX512 runs at 44Hz (1 complete universe every 22.7ms).
    DMXLiveFrameHz = 44

    // DMXAdapterQueueDepth is the buffered channel capacity for USB and ArtNet adapters.
    // A depth of 2 allows one frame to be processed while another is queued,
    // balancing latency and throughput.
    DMXAdapterQueueDepth = 2

    // DMXBaudRate is the serial baud rate for DMX512 output.
    // The DMX512 standard specifies 250kbps (250000 baud).
    DMXBaudRate = 250000

    // ProbeThrottleTTL prevents hammering the same device with discovery probes.
    // Devices are only re-probed after this duration elapses.
    ProbeThrottleTTL = 8 * time.Second

    // ProbeMapCleanupThreshold triggers cleanup when probe cache grows too large.
    // This prevents unbounded memory growth from discovery probes.
    ProbeMapCleanupThreshold = 384

    // AP24MaxChannel is the maximum 2.4GHz Wi-Fi channel number.
    // WLED hardware commonly uses 2.4GHz-only Wi-Fi; the controller AP must stay on this band.
    // Valid channels: 1-14 (channel 14 restricted in some regions).
    AP24MaxChannel = 14
)
```

**Benefits**:
- Self-documenting code
- Easier for new developers to understand
- Clear rationale for magic numbers
- Easier to find and update related constants

---

### 11. Missing USB Device Abstraction

**Status**: 🟡 Not Started
**Files**: `internal/dmx/dmx_live_output.go`, `internal/controller/controller.go`
**Lines**: 26-61 (dmx_live_output.go), 1501, 1531 (controller.go)
**Priority**: Medium
**Impact**: Low
**Effort**: Low

**Problem**: Device selection logic duplicated in multiple places with identical error handling patterns.

**Duplicated Pattern**:
```go
dev, ok := dmx.PickUSBSerialDevice(deviceID, serial2.ListUSBSerialDevices())
if !ok {
    return fmt.Errorf("selected usb serial device is not currently attached")
}
```

**Recommended Solution**:
```go
// In controller.go
func (c *WLEDController) resolveUSBDevice(deviceID string) (serial2.USBSerialDevice, error) {
    devices := serial2.ListUSBSerialDevices()
    dev, ok := dmx.PickUSBSerialDevice(deviceID, devices)
    if !ok {
        return serial2.USBSerialDevice{}, fmt.Errorf("USB serial device '%s' is not currently attached", deviceID)
    }
    return dev, nil
}

// Usage
func (c *WLEDController) StartDMXLive(fixtureID string) error {
    // ... fixture lookup ...

    dev, err := c.resolveUSBDevice(c.dmxState.SelectedUSBSerialDeviceID)
    if err != nil {
        return err
    }

    // ... use dev ...
}
```

**Benefits**:
- Centralized device resolution logic
- Consistent error messages
- Easier to add logging or metrics

---

### 12. Temporal Coupling in Network Settings Workflow

**Status**: 🟡 Not Started
**File**: `internal/controller/controller.go`
**Lines**: 1016-1039
**Priority**: Medium
**Impact**: Medium
**Effort**: Medium

**Problem**: `SaveSettings()` and `ApplyNetwork()` are separate operations that must be called in specific order, but this isn't enforced.

**Current Situation**:
```go
// SaveSettings saves to disk
func (c *WLEDController) SaveSettings(settings ControllerSettings) error {
    // ... saves to disk
}

// ApplyNetwork applies current settings (must follow SaveSettings)
func (c *WLEDController) ApplyNetwork(ctx context.Context) NetworkApplyResult {
    // ... applies current settings
}

// Frontend must call them separately
await GreetService.SaveControllerSettings(settings);
await GreetService.ApplyNetworkSettings();
```

**Problem**: User could Apply without Saving or vice versa, leading to inconsistent state.

**Recommended Solution**:

Option 1: **Composite operation**:
```go
func (c *WLEDController) SaveAndApplyNetwork(ctx context.Context, settings ControllerSettings) (ControllerSnapshot, NetworkApplyResult, error) {
    if err := c.SaveSettings(settings); err != nil {
        return ControllerSnapshot{}, NetworkApplyResult{}, err
    }
    result := c.ApplyNetwork(ctx)
    return c.Snapshot(), result, nil
}
```

Option 2: **Transaction-like pattern**:
```go
type SettingsTransaction struct {
    controller *WLEDController
    settings   ControllerSettings
    saved      bool
}

func (c *WLEDController) BeginSettingsUpdate(settings ControllerSettings) *SettingsTransaction {
    return &SettingsTransaction{
        controller: c,
        settings:   settings,
        saved:      false,
    }
}

func (t *SettingsTransaction) Save() error {
    err := t.controller.SaveSettings(t.settings)
    if err == nil {
        t.saved = true
    }
    return err
}

func (t *SettingsTransaction) ApplyNetwork(ctx context.Context) (NetworkApplyResult, error) {
    if !t.saved {
        return NetworkApplyResult{}, fmt.Errorf("settings must be saved before applying network")
    }
    return t.controller.ApplyNetwork(ctx), nil
}
```

**Benefits**:
- Enforces correct operation order
- Prevents inconsistent state
- Clearer API for frontend

---

## 🟢 Low Priority Refactorings

### 13. Duplicated Preset Data

**Status**: 🟢 Not Started
**Files**:
- `frontend/src/components/presets/GeneralPanel.tsx` (Lines 35-46)
- `frontend/src/components/device/DeviceDetailView.tsx` (Lines 60-71)
**Priority**: Low
**Impact**: Low
**Effort**: Trivial

**Problem**: Identical `NAMED_LIGHT_PRESETS` array defined in two places.

**Current Situation**:
```typescript
// In both files:
const NAMED_LIGHT_PRESETS: Array<{ label: string; rgb: [number, number, number] }> = [
    {label: "Red", rgb: [255, 0, 0]},
    {label: "Green", rgb: [0, 255, 0]},
    {label: "Blue", rgb: [0, 0, 255]},
    {label: "Yellow", rgb: [255, 255, 0]},
    {label: "Cyan", rgb: [0, 255, 255]},
    {label: "Magenta", rgb: [255, 0, 255]},
    {label: "Orange", rgb: [255, 165, 0]},
    {label: "Purple", rgb: [128, 0, 128]},
];
```

**Recommended Solution**:

Create `frontend/src/lib/presets.ts`:
```typescript
export type ColorPreset = {
    label: string;
    rgb: [number, number, number];
};

export const NAMED_LIGHT_PRESETS: ColorPreset[] = [
    {label: "Red", rgb: [255, 0, 0]},
    {label: "Green", rgb: [0, 255, 0]},
    {label: "Blue", rgb: [0, 0, 255]},
    {label: "Yellow", rgb: [255, 255, 0]},
    {label: "Cyan", rgb: [0, 255, 255]},
    {label: "Magenta", rgb: [255, 0, 255]},
    {label: "Orange", rgb: [255, 165, 0]},
    {label: "Purple", rgb: [128, 0, 128]},
];
```

Then import in both files:
```typescript
import {NAMED_LIGHT_PRESETS} from "@/lib/presets";
```

**Benefits**:
- DRY principle
- Single source of truth
- Easier to add new presets

---

### 14. Complex Discovery Device Extraction

**Status**: 🟢 Not Started
**File**: `internal/discovery/discovery.go`
**Lines**: 163-185, 204-229
**Priority**: Low
**Impact**: Low
**Effort**: Low

**Problem**: `DiscoveredFromZeroconf()` and `toDiscoveredDevice()` have nearly identical logic for extracting host, address, port, and name.

**Recommended Solution**:
```go
// Extract common extraction logic
func extractDeviceInfo(hostname string, addrs []string, port int, txtRecords map[string]string) (host, address string) {
    // Common logic for cleaning hostname, selecting address, etc.
    host = hostname
    if strings.HasSuffix(host, ".local.") {
        host = strings.TrimSuffix(host, ".local.")
    } else if strings.HasSuffix(host, ".local") {
        host = strings.TrimSuffix(host, ".local")
    }

    if len(addrs) > 0 {
        address = addrs[0]
    }

    return host, address
}

// Use in both methods
func DiscoveredFromZeroconf(serviceType string, entry *zeroconf.ServiceEntry) (DiscoveredDevice, bool) {
    host, address := extractDeviceInfo(entry.HostName, entry.AddrIPv4, entry.Port, /* txtRecords */)
    // ... rest of logic
}

func toDiscoveredDevice(srv *mdns.ServiceEntry) DiscoveredDevice {
    host, address := extractDeviceInfo(srv.Host, srv.AddrV4, srv.Port, /* txtRecords */)
    // ... rest of logic
}
```

**Benefits**:
- DRY principle
- Easier to modify extraction logic
- More consistent behavior

---

## 📋 Summary Table

| # | Refactoring | Status | Priority | Impact | Effort | File(s) |
|---|------------|--------|----------|--------|--------|---------|
| 1 | Service layer boilerplate | ✅ Done | High | High | Medium | goldbuslightservice.go |
| 2 | Timeout constants | ✅ Done | High | Medium | Low | goldbuslightservice.go |
| 3 | Frontend hook splitting | ✅ Partial | High | High | High | useControllerApp.ts |
| 4 | Prop drilling | 🔴 Todo | High | High | Medium | DeviceDetailView.tsx, App.tsx |
| 5 | Oversized Zustand store | 🔴 Todo | High | High | Medium | controllerStore.ts |
| 6 | Lock management | 🔴 Todo | High | Medium | Medium | controller.go |
| 7 | Device state duplication | 🟡 Todo | Medium | Medium | Low | controller.go |
| 8 | Asymmetric error handling | 🟡 Todo | Medium | Medium | Low | controller.go |
| 9 | Overly broad map[string]any | 🟡 Todo | Medium | Medium | High | controller.go |
| 10 | Hardcoded constants | 🟡 Todo | Medium | Low | Low | controller.go |
| 11 | USB device abstraction | 🟡 Todo | Medium | Low | Low | dmx_live_output.go, controller.go |
| 12 | Temporal coupling | 🟡 Todo | Medium | Medium | Medium | controller.go |
| 13 | Duplicated preset data | 🟢 Todo | Low | Low | Trivial | GeneralPanel.tsx, DeviceDetailView.tsx |
| 14 | Complex discovery logic | 🟢 Todo | Low | Low | Low | discovery.go |

---

## Recommended Implementation Order

Based on impact, effort, and dependencies:

### Phase 1: Quick Wins (Already Done ✅)
1. ✅ Service layer boilerplate
2. ✅ Timeout constants
3. ✅ Frontend hook creation (integration pending)

### Phase 2: High-Impact Frontend (Next)
4. Complete frontend hook integration
5. Fix excessive prop drilling
6. Refactor Zustand store

### Phase 3: Backend Improvements
7. Lock management consistency
8. Device state update extraction
9. Asymmetric error handling

### Phase 4: Type Safety
10. Add typed WLED state structures

### Phase 5: Polish
11. Document hardcoded constants
12. Extract USB device abstraction
13. Fix temporal coupling
14. Clean up duplicated presets
15. Simplify discovery logic

---

## Testing Strategy

After each refactoring:

1. **Unit Tests**: Add/update tests for refactored code
2. **Integration Tests**: Verify interactions still work
3. **Manual Testing**: Test affected UI flows
4. **Performance**: Measure impact on performance-critical paths

---

## Notes

- All refactorings maintain backward compatibility where possible
- Breaking changes should be documented and communicated
- Consider feature flags for risky refactorings
- Measure before and after (lines of code, cyclomatic complexity, test coverage)

---

## References

- See `REFACTORING_NOTES.md` for detailed notes on completed work
- See `CLAUDE.md` for codebase architecture overview
- See git history for implementation details of completed refactorings

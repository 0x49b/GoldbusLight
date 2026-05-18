import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useShallow} from "zustand/shallow";
import * as GreetService from "../../bindings/goldbus/internal/service/goldbuslightservice";
import {DMXLiveStatus, DMXOutputUpdate} from "../../bindings/goldbus/internal/dmx/models";
import {useControllerStore} from "../store/controllerStore";
import {parseJSONMap, prettyJSON, readNumber} from "../lib/json";
import {
  COLD_WHITE_RGB,
  coldWhiteState,
  mainSegIndex,
  rgbFromSegment,
  rgbState,
  segmentAt,
  segmentFx,
  segmentIx,
  segmentPal,
  segmentSx,
  WARM_WHITE_RGB,
  warmWhiteState,
} from "../lib/wled";
import type {
  ConsoleEntry,
  ControllerSettings,
  ControllerSnapshot,
  DMXFixture,
  DMXState,
  JSONMap,
  NetworkApplyResult,
  UpsertDMXFixtureInput,
  USBSerialDevice,
  WLEDDevice,
  WLEDDeviceDetail,
} from "../types/controller";

const DEVICE_DETAIL_MAX_TRIES = 5;
const DEVICE_DETAIL_TRY_MS = 10_000;
const DEVICE_DETAIL_RETRY_DELAY_MS = 400;

/** Background snapshot poll to pick up devices coming back online (matches header Refresh data). */
const BACKGROUND_SNAPSHOT_POLL_MS = 30_000;

/** Live console poll interval. */
const CONSOLE_POLL_MS = 750;
/** Max console entries kept in the UI ring buffer. */
const CONSOLE_MAX_ENTRIES = 500;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type CancellableThenable<T> = PromiseLike<T> & { cancel?: (cause?: unknown) => void };

async function awaitCancellableWithTimeout<T>(
    p: CancellableThenable<T>,
    ms: number,
    cause = "timeout",
): Promise<T> {
    let tid: ReturnType<typeof setTimeout> | undefined;
    const timeoutP = new Promise<never>((_, reject) => {
        tid = setTimeout(() => {
            try {
                p.cancel?.(cause);
            } catch {
                /* ignore */
            }
            reject(new Error(`Request timed out after ${ms}ms`));
        }, ms);
    });
    try {
        return await Promise.race([Promise.resolve(p) as Promise<T>, timeoutP]);
    } finally {
        if (tid !== undefined) {
            clearTimeout(tid);
        }
    }
}

function markDeviceOfflineInSnapshot(
    prev: ControllerSnapshot | null,
    deviceId: string,
): ControllerSnapshot | null {
    if (!prev) {
        return prev;
    }
    let changed = false;
    const devices = prev.devices.map((d) => {
        if (d.id !== deviceId) {
            return d;
        }
        if (d.online === false) {
            return d;
        }
        changed = true;
        return {...d, online: false};
    });
    if (!changed) {
        return prev;
    }
    return {...prev, devices};
}

export function useControllerApp() {
    const {
        snapshot,
        settings,
        applyResult,
        status,
        error,
        statePayloadText,
        configPatchText,
        presetBri,
        presetRgb,
        generalFx,
        generalPal,
        generalSx,
        generalIx,
        busy,
        discovering,
        route,
        deviceDetail,
        deviceDetailInitializing,
        deviceDetailReloading,
        deviceDetailFetchAttempt,
        deviceFormFx,
        deviceFormPal,
        deviceFormSx,
        deviceFormIx,
        deviceFormRgb,
        deviceFormBri,
        deviceFormTransition,
        selectedSegIdx,
        ignoredDevices,
        deviceNameDraft,
        editingDeviceName,
        currentVersion,
        dmxState,
        usbSerialDevices,
        consoleEntries,
        consoleLastId,
        consoleDetached,
        setSnapshot,
        setSettings,
        setApplyResult,
        setStatus,
        setError,
        setStatePayloadText,
        setConfigPatchText,
        setPresetBri,
        setPresetRgb,
        setGeneralFx,
        setGeneralPal,
        setGeneralSx,
        setGeneralIx,
        setBusy,
        setDiscovering,
        setRoute,
        setDeviceDetail,
        setDeviceDetailInitializing,
        setDeviceDetailReloading,
        setDeviceDetailFetchAttempt,
        setDeviceFormFx,
        setDeviceFormPal,
        setDeviceFormSx,
        setDeviceFormIx,
        setDeviceFormRgb,
        setDeviceFormBri,
        setDeviceFormTransition,
        setSelectedSegIdx,
        setIgnoredDevices,
        setDeviceNameDraft,
        setEditingDeviceName,
        setCurrentVersion,
        setDMXState,
        setUSBSerialDevices,
        setConsoleEntries,
        setConsoleLastId,
        setConsoleDetached,
    } = useControllerStore(
        useShallow((s) => ({
            snapshot: s.snapshot,
            settings: s.settings,
            applyResult: s.applyResult,
            status: s.status,
            error: s.error,
            statePayloadText: s.statePayloadText,
            configPatchText: s.configPatchText,
            presetBri: s.presetBri,
            presetRgb: s.presetRgb,
            generalFx: s.generalFx,
            generalPal: s.generalPal,
            generalSx: s.generalSx,
            generalIx: s.generalIx,
            busy: s.busy,
            discovering: s.discovering,
            route: s.route,
            deviceDetail: s.deviceDetail,
            deviceDetailInitializing: s.deviceDetailInitializing,
            deviceDetailReloading: s.deviceDetailReloading,
            deviceDetailFetchAttempt: s.deviceDetailFetchAttempt,
            deviceFormFx: s.deviceFormFx,
            deviceFormPal: s.deviceFormPal,
            deviceFormSx: s.deviceFormSx,
            deviceFormIx: s.deviceFormIx,
            deviceFormRgb: s.deviceFormRgb,
            deviceFormBri: s.deviceFormBri,
            deviceFormTransition: s.deviceFormTransition,
            selectedSegIdx: s.selectedSegIdx,
            ignoredDevices: s.ignoredDevices,
            deviceNameDraft: s.deviceNameDraft,
            editingDeviceName: s.editingDeviceName,
            currentVersion: s.currentVersion,
            dmxState: s.dmxState,
            usbSerialDevices: s.usbSerialDevices,
            consoleEntries: s.consoleEntries,
            consoleLastId: s.consoleLastId,
            consoleDetached: s.consoleDetached,
            setSnapshot: s.setSnapshot,
            setSettings: s.setSettings,
            setApplyResult: s.setApplyResult,
            setStatus: s.setStatus,
            setError: s.setError,
            setStatePayloadText: s.setStatePayloadText,
            setConfigPatchText: s.setConfigPatchText,
            setPresetBri: s.setPresetBri,
            setPresetRgb: s.setPresetRgb,
            setGeneralFx: s.setGeneralFx,
            setGeneralPal: s.setGeneralPal,
            setGeneralSx: s.setGeneralSx,
            setGeneralIx: s.setGeneralIx,
            setBusy: s.setBusy,
            setDiscovering: s.setDiscovering,
            setRoute: s.setRoute,
            setDeviceDetail: s.setDeviceDetail,
            setDeviceDetailInitializing: s.setDeviceDetailInitializing,
            setDeviceDetailReloading: s.setDeviceDetailReloading,
            setDeviceDetailFetchAttempt: s.setDeviceDetailFetchAttempt,
            setDeviceFormFx: s.setDeviceFormFx,
            setDeviceFormPal: s.setDeviceFormPal,
            setDeviceFormSx: s.setDeviceFormSx,
            setDeviceFormIx: s.setDeviceFormIx,
            setDeviceFormRgb: s.setDeviceFormRgb,
            setDeviceFormBri: s.setDeviceFormBri,
            setDeviceFormTransition: s.setDeviceFormTransition,
            setSelectedSegIdx: s.setSelectedSegIdx,
            setIgnoredDevices: s.setIgnoredDevices,
            setDeviceNameDraft: s.setDeviceNameDraft,
            setEditingDeviceName: s.setEditingDeviceName,
            setCurrentVersion: s.setCurrentVersion,
            setDMXState: s.setDMXState,
            setUSBSerialDevices: s.setUSBSerialDevices,
            setConsoleEntries: s.setConsoleEntries,
            setConsoleLastId: s.setConsoleLastId,
            setConsoleDetached: s.setConsoleDetached,
        })),
    );

    const detailDeviceIdRef = useRef<string>("");
    /** Latest GET /json/state for the open device (for debounced callbacks; avoids stale closures). */
    const deviceDetailRef = useRef<WLEDDeviceDetail | null>(null);
    /** After user sets `on: false`, block bri/seg auto-apply until GET state reflects off (stale timer / bri waking strip). */
    const deviceAutoApplyBlockedForPowerOffRef = useRef(false);
    /** After hydrating the form from GET state, skip the next N auto-apply runs (server push + follow-up form render). */
    const deviceStateAutoApplyHydrationSuppressRef = useRef(0);
    const presetColorAutoApplySkipRef = useRef(false);
    const presetColorAutoApplyIsInitialRef = useRef(true);
    const lastFormChangeAtMsRef = useRef(0);
    const pendingUiPatchRef = useRef<{ patch: JSONMap; atMs: number } | null>(null);
    const detailInitDoneRef = useRef(false);
    const deviceDetailOpSeqRef = useRef(0);
    const currentDetailTargetIdRef = useRef<string | null>(null);
    const inflightGetDetailRef = useRef<{ cancel?: (cause?: unknown) => void } | null>(null);
    const lastAuthoritativeResendAtMsRef = useRef(0);
    const lastDeviceAutoApplySentAtMsRef = useRef(0);
    const autoApplyPrevDepsRef = useRef<{
        rgb: [number, number, number];
        bri: number;
        transition: number;
        sx: number;
        ix: number;
        segIdx: number;
        selectedDeviceID: string;
    } | null>(null);
    const uiFormRef = useRef({
        bri: 180,
        transition: 7,
        fx: 0,
        pal: 0,
        sx: 128,
        ix: 128,
        rgb: [255, 0, 0] as [number, number, number],
        segIdx: 0,
    });

    const dmxLivePendingRef = useRef<Map<number, number>>(new Map());
    const dmxLiveFlushTimerRef = useRef<number | undefined>(undefined);
    const [dmxLiveStatus, setDmxLiveStatus] = useState<DMXLiveStatus | null>(null);
    const settingsEditLockUntilRef = useRef(0);

    const markSettingsInteraction = useCallback((holdMs = 5000) => {
        const now = Date.now();
        const until = now + Math.max(250, holdMs);
        settingsEditLockUntilRef.current = Math.max(settingsEditLockUntilRef.current, until);
    }, []);

    const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);

    const selectedDevice = useMemo(() => {
        if (route.kind !== "device") return undefined;
        return devices.find((d) => d.id === route.id);
    }, [devices, route]);

    const selectedFixture = useMemo(() => {
        if (route.kind !== "dmxFixture") {
            return undefined;
        }
        return dmxState.fixtures.find((fixture) => fixture.id === route.id);
    }, [dmxState.fixtures, route]);

    const wledEnabled = settings?.wled.enabled ?? true;
    const dmxEnabled = settings?.dmx.enabled ?? true;

    useEffect(() => {
        if (!settings) {
            return;
        }
        setRoute((prev) => {
            if (!settings.wled.enabled && (prev.kind === "presets" || prev.kind === "device")) {
                return {kind: "settings"};
            }
            if (!settings.dmx.enabled && (prev.kind === "dmxUniverse" || prev.kind === "dmxAddFixture" || prev.kind === "dmxFixture")) {
                return {kind: "settings"};
            }
            return prev;
        });
    }, [setRoute, settings]);

    useEffect(() => {
        if (route.kind !== "device" || !selectedDevice) {
            setEditingDeviceName(false);
            return;
        }
        setDeviceNameDraft(selectedDevice.name);
        setEditingDeviceName(false);
    }, [route.kind, selectedDevice?.id]);

    useEffect(() => {
        if (!selectedDevice || editingDeviceName) {
            return;
        }
        setDeviceNameDraft(selectedDevice.name);
    }, [selectedDevice?.name, editingDeviceName, selectedDevice]);

    const pullDMXState = useCallback(async () => {
        const next = (await GreetService.GetDMXState()) as DMXState;
        setDMXState(next);
        return next;
    }, []);

    const pullUSBSerialDevices = useCallback(async () => {
        const devices = (await GreetService.ListUSBSerialDevices()) as USBSerialDevice[];
        setUSBSerialDevices(devices);
        return devices;
    }, []);

    const pullSnapshot = useCallback(async () => {
        const next = (await GreetService.GetControllerSnapshot()) as unknown as ControllerSnapshot;
        setSnapshot(next);
        const settingsEditingActive = Date.now() < settingsEditLockUntilRef.current;
        if (!settingsEditingActive) {
            setSettings(next.settings);
            setStatePayloadText(prettyJSON(next.settings.wled.provisioning.defaultStatePayload ?? {}));
            setConfigPatchText(prettyJSON(next.settings.wled.provisioning.defaultConfigPatch ?? {}));
        }
        setStatus(`Updated ${new Date(next.updatedAt).toLocaleTimeString()}`);
        setError("");
        const gst = (next as ControllerSnapshot & {
            generalTabState?: {
                bri?: unknown;
                rgb?: unknown;
                fx?: unknown;
                pal?: unknown;
                sx?: unknown;
                ix?: unknown
            };
        }).generalTabState;
        if (gst) {
            setPresetBri(readNumber(gst.bri, 200));
            const rgbRaw = Array.isArray(gst.rgb) ? gst.rgb : [];
            const nextRgb: [number, number, number] = [
                readNumber(rgbRaw[0], WARM_WHITE_RGB[0]),
                readNumber(rgbRaw[1], WARM_WHITE_RGB[1]),
                readNumber(rgbRaw[2], WARM_WHITE_RGB[2]),
            ];
            setPresetRgb((prev) => {
                const unchanged =
                    prev[0] === nextRgb[0] &&
                    prev[1] === nextRgb[1] &&
                    prev[2] === nextRgb[2];
                if (unchanged) {
                    return prev;
                }
                return nextRgb;
            });
            setGeneralFx(readNumber(gst.fx, 0));
            setGeneralPal(readNumber(gst.pal, 0));
            setGeneralSx(readNumber(gst.sx, 128));
            setGeneralIx(readNumber(gst.ix, 128));
        }
        try {
            const ign = (await GreetService.GetIgnoredDevices()) as WLEDDevice[];
            setIgnoredDevices(ign);
        } catch {
            setIgnoredDevices([]);
        }
        try {
            await pullDMXState();
        } catch {
            setDMXState((prev) => ({...prev, fixtures: prev.fixtures ?? []}));
        }
        try {
            await pullUSBSerialDevices();
        } catch {
            setUSBSerialDevices([]);
        }
    }, [pullDMXState, pullUSBSerialDevices]);

    useEffect(() => {
        void pullSnapshot().catch((err: unknown) => {
            setError(String(err));
        });
        const timer = window.setInterval(() => {
            void pullSnapshot().catch((err: unknown) => {
                setError(String(err));
            });
        }, BACKGROUND_SNAPSHOT_POLL_MS);
        return () => window.clearInterval(timer);
    }, [pullSnapshot]);

    const pullConsoleEntries = useCallback(async () => {
        const latest = useControllerStore.getState();
        const afterID = latest.consoleLastId;
        try {
            const next = (await GreetService.ListConsoleEntries(afterID, 200)) as ConsoleEntry[];
            if (!Array.isArray(next) || next.length === 0) {
                return;
            }
            let maxID = afterID;
            for (const entry of next) {
                if (entry.id > maxID) {
                    maxID = entry.id;
                }
            }
            setConsoleEntries((prev) => {
                const combined = prev.concat(next);
                if (combined.length <= CONSOLE_MAX_ENTRIES) {
                    return combined;
                }
                return combined.slice(combined.length - CONSOLE_MAX_ENTRIES);
            });
            setConsoleLastId(maxID);
        } catch {
            /* ignore transient errors */
        }
    }, [setConsoleEntries, setConsoleLastId]);

    const pullConsoleDetachedStatus = useCallback(async () => {
        try {
            const detached = await GreetService.IsConsoleWindowDetached();
            setConsoleDetached(Boolean(detached));
        } catch {
            /* ignore transient errors */
        }
    }, [setConsoleDetached]);

    useEffect(() => {
        void pullConsoleEntries();
        void pullConsoleDetachedStatus();
        const timer = window.setInterval(() => {
            void pullConsoleEntries();
            void pullConsoleDetachedStatus();
        }, CONSOLE_POLL_MS);
        return () => window.clearInterval(timer);
    }, [pullConsoleDetachedStatus, pullConsoleEntries]);

    const onClearConsole = useCallback(() => {
        setConsoleEntries([]);
        void GreetService.ClearConsoleEntries().catch(() => {
            /* ignore */
        });
    }, [setConsoleEntries]);

    const openDetachedConsoleWindow = useCallback(() => {
        void GreetService.OpenDetachedConsoleWindow()
            .then(() => setConsoleDetached(true))
            .catch(() => {
                /* ignore */
            });
    }, [setConsoleDetached]);

    const closeDetachedConsoleWindow = useCallback(() => {
        void GreetService.CloseDetachedConsoleWindow()
            .then(() => setConsoleDetached(false))
            .catch(() => {
                /* ignore */
            });
    }, [setConsoleDetached]);

    useEffect(() => {
        if (route.kind !== "device") {
            return;
        }
        if (!snapshot) {
            return;
        }
        const dev = snapshot.devices.find((d) => d.id === route.id);
        if (!dev) {
            setRoute({kind: "presets"});
            setStatus("That device is no longer in the controller.");
            return;
        }
        if (dev.online === false) {
            setRoute({kind: "presets"});
            setStatus("Device offline — use Discover or Refresh in the header. When it is online again, open it from the sidebar.");
        }
    }, [route, snapshot, setRoute, setStatus]);

    useEffect(() => {
        void GreetService.AppVersion()
            .then((version) => {
                if (version && version.trim() !== "") {
                    setCurrentVersion(version);
                }
            })
            .catch(() => {
            });
    }, []);

    type LoadDeviceDetailOpts = { maxAttempts?: number; showAttempts?: boolean };

    const loadDeviceDetail = useCallback(async (deviceId: string, opts?: LoadDeviceDetailOpts) => {
        deviceDetailOpSeqRef.current += 1;
        const opSeq = deviceDetailOpSeqRef.current;
        const maxAttempts = opts?.maxAttempts ?? 1;
        const showAttempts = opts?.showAttempts ?? false;

        const shouldAbort = () =>
            currentDetailTargetIdRef.current !== deviceId || opSeq !== deviceDetailOpSeqRef.current;

        const applyFetchedDetail = (d: WLEDDeviceDetail) => {
            if (shouldAbort()) {
                return;
            }
            const prevDetailId = detailDeviceIdRef.current;
            const isInitialLoad = !detailInitDoneRef.current;
            if (isInitialLoad) {
                detailInitDoneRef.current = true;
                setDeviceDetailInitializing(false);
            }
            const pending = pendingUiPatchRef.current;
            const pendingSatisfied = pending && d.state ? isPatchSatisfiedByState(d.state as JSONMap, pending.patch) : false;
            if (pending && pendingSatisfied) {
                pendingUiPatchRef.current = null;
            }
            const authoritativePatch = buildAuthoritativePatch(uiFormRef.current);
            const incomingDiffersFromUi = !isInitialLoad && detailInitDoneRef.current && d.state
                ? !isPatchSatisfiedByState(d.state as JSONMap, authoritativePatch)
                : false;
            if (incomingDiffersFromUi && d.state) {
                const now = Date.now();
                const resendAllowed = now - lastAuthoritativeResendAtMsRef.current > 250;
                if (resendAllowed) {
                    lastAuthoritativeResendAtMsRef.current = now;
                    pendingUiPatchRef.current = {patch: authoritativePatch, atMs: now};
                    void GreetService.SetDeviceState(deviceId, authoritativePatch).catch((err: unknown) => {
                        setError(String(err));
                    });
                }
                setDeviceDetail((prev) => {
                    const base = (prev?.state as JSONMap | undefined) ?? (d.state as JSONMap);
                    return {
                        ...d,
                        state: applyStatePatch(base, authoritativePatch),
                        online: true,
                        error: "",
                    };
                });
                return;
            }
            setDeviceDetail(d);
            detailDeviceIdRef.current = deviceId;
            if (d.state && prevDetailId !== deviceId) {
                setSelectedSegIdx(mainSegIndex(d.state as JSONMap));
            }
            if (d.online === false) {
                setSnapshot((prev) => markDeviceOfflineInSnapshot(prev, deviceId));
            }
        };

        let lastError: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (shouldAbort()) {
                if (showAttempts) {
                    setDeviceDetailFetchAttempt(0);
                }
                return;
            }
            if (showAttempts) {
                setDeviceDetailFetchAttempt(attempt);
            }
            const rawP = GreetService.GetDeviceDetail(deviceId);
            inflightGetDetailRef.current = rawP;
            try {
                const d = (await awaitCancellableWithTimeout(rawP, DEVICE_DETAIL_TRY_MS)) as WLEDDeviceDetail;
                inflightGetDetailRef.current = null;
                if (shouldAbort()) {
                    if (showAttempts) {
                        setDeviceDetailFetchAttempt(0);
                    }
                    return;
                }
                applyFetchedDetail(d);
                if (showAttempts) {
                    setDeviceDetailFetchAttempt(0);
                }
                return;
            } catch (e) {
                lastError = e;
                inflightGetDetailRef.current = null;
                if (shouldAbort()) {
                    if (showAttempts) {
                        setDeviceDetailFetchAttempt(0);
                    }
                    return;
                }
                if (attempt < maxAttempts) {
                    await sleep(DEVICE_DETAIL_RETRY_DELAY_MS);
                }
            }
        }

        if (showAttempts) {
            setDeviceDetailFetchAttempt(0);
        }
        if (shouldAbort()) {
            return;
        }

        setDeviceDetail({
            online: false,
            error: String(lastError ?? "unknown"),
            address: "",
            port: 80,
        });
        detailDeviceIdRef.current = deviceId;
        detailInitDoneRef.current = true;
        setDeviceDetailInitializing(false);
        setSnapshot((prev) => markDeviceOfflineInSnapshot(prev, deviceId));
    }, []);

    useEffect(() => {
        if (route.kind !== "device") {
            return;
        }
        uiFormRef.current = {
            bri: deviceFormBri,
            transition: deviceFormTransition,
            fx: deviceFormFx,
            pal: deviceFormPal,
            sx: deviceFormSx,
            ix: deviceFormIx,
            rgb: deviceFormRgb,
            segIdx: selectedSegIdx,
        };
        lastFormChangeAtMsRef.current = Date.now();
    }, [deviceFormBri, deviceFormFx, deviceFormIx, deviceFormPal, deviceFormRgb, deviceFormSx, deviceFormTransition, route.kind, selectedSegIdx]);

    useEffect(() => {
        if (!deviceDetail?.state) {
            return;
        }
        const st = deviceDetail.state as JSONMap;
        const segs = st.seg;
        const n = Array.isArray(segs) ? segs.length : 0;
        if (n === 0) {
            return;
        }
        setSelectedSegIdx((prev) => (prev >= 0 && prev < n ? prev : mainSegIndex(st)));
    }, [deviceDetail?.state]);

    useEffect(() => {
        deviceDetailRef.current = deviceDetail;
    }, [deviceDetail]);

    useEffect(() => {
        if (!deviceDetail?.state) {
            return;
        }
        const st = deviceDetail.state as JSONMap;
        const seg = segmentAt(st, selectedSegIdx);
        if (!seg) {
            return;
        }
        const pending = pendingUiPatchRef.current;
        const pendingAgeMs = pending ? Date.now() - pending.atMs : -1;
        const pendingSatisfied = pending ? isPatchSatisfiedByState(st, pending.patch) : true;
        const pendingStillAuthoritative = !!pending && !pendingSatisfied && pendingAgeMs < 4000;
        if (pendingStillAuthoritative) {
            return;
        }
        if (pending && pendingSatisfied) {
            pendingUiPatchRef.current = null;
        }
        const nextFx = segmentFx(seg);
        const nextPal = segmentPal(seg);
        const nextSx = segmentSx(seg);
        const nextIx = segmentIx(seg);
        const nextRgb = rgbFromSegment(seg);
        const nextBri = readNumber(st.bri, 180);
        const nextTransition = readNumber(st.transition, 7);
        const currentForm = uiFormRef.current;
        const hydrationIsNoOp =
            currentForm.fx === nextFx &&
            currentForm.pal === nextPal &&
            currentForm.sx === nextSx &&
            currentForm.ix === nextIx &&
            currentForm.bri === nextBri &&
            currentForm.transition === nextTransition &&
            currentForm.rgb[0] === nextRgb[0] &&
            currentForm.rgb[1] === nextRgb[1] &&
            currentForm.rgb[2] === nextRgb[2];
        if (hydrationIsNoOp) {
            return;
        }
        deviceStateAutoApplyHydrationSuppressRef.current += 1;
        setDeviceFormFx(nextFx);
        setDeviceFormPal(nextPal);
        setDeviceFormSx(nextSx);
        setDeviceFormIx(nextIx);
        setDeviceFormRgb(nextRgb);
        setDeviceFormBri(nextBri);
        setDeviceFormTransition(nextTransition);
    }, [deviceDetail, selectedSegIdx]);

    useEffect(() => {
        if (route.kind !== "device") {
            currentDetailTargetIdRef.current = null;
            setDeviceDetail(null);
            detailDeviceIdRef.current = "";
            detailInitDoneRef.current = false;
            setDeviceDetailInitializing(false);
            setDeviceDetailFetchAttempt(0);
            return;
        }
        currentDetailTargetIdRef.current = route.id;
        detailInitDoneRef.current = false;
        setDeviceDetailInitializing(true);
        void loadDeviceDetail(route.id, {maxAttempts: DEVICE_DETAIL_MAX_TRIES, showAttempts: true});
        const t = window.setInterval(() => {
            void loadDeviceDetail(route.id, {maxAttempts: 1, showAttempts: false});
        }, 5000);
        return () => {
            window.clearInterval(t);
            inflightGetDetailRef.current?.cancel?.("navigate");
            deviceDetailOpSeqRef.current += 1;
            setDeviceDetailFetchAttempt(0);
        };
    }, [route, loadDeviceDetail]);

    useEffect(() => {
        if (route.kind !== "dmxFixture") {
            return;
        }
        const exists = dmxState.fixtures.some((fixture) => fixture.id === route.id);
        if (!exists) {
            setRoute({kind: "dmxAddFixture"});
        }
    }, [dmxState.fixtures, route, setRoute]);

    const withBusy = useCallback(async (work: () => Promise<void>) => {
        setBusy(true);
        try {
            await work();
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    }, []);

    const ensureWLEDEnabled = useCallback((): boolean => {
        if ((settings?.wled.enabled ?? true) === false) {
            setError("WLED component is disabled in Settings.");
            return false;
        }
        return true;
    }, [settings?.wled.enabled, setError]);

    const ensureDMXEnabled = useCallback((): boolean => {
        if ((settings?.dmx.enabled ?? true) === false) {
            setError("DMX component is disabled in Settings.");
            return false;
        }
        return true;
    }, [settings?.dmx.enabled, setError]);

    const onSaveSettings = useCallback(async (): Promise<boolean> => {
        const latest = useControllerStore.getState();
        const latestSettings = latest.settings;
        if (!latestSettings) {
            return false;
        }
        try {
            const statePayload = parseJSONMap(latest.statePayloadText);
            const configPatch = parseJSONMap(latest.configPatchText);

            const merged: ControllerSettings = {
                ...latestSettings,
                wled: {
                    ...latestSettings.wled,
                    provisioning: {
                        ...latestSettings.wled.provisioning,
                        defaultStatePayload: statePayload,
                        defaultConfigPatch: configPatch,
                    },
                },
            };

            const saved = (await GreetService.SaveControllerSettings(merged as never)) as unknown as ControllerSnapshot;
            setSnapshot(saved);
            setSettings(saved.settings);
            setStatus("Settings saved");
            setError("");
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        }
    }, []);

    const onApplyNetwork = useCallback(() => {
        void withBusy(async () => {
            const result = (await GreetService.ApplyNetworkSettings()) as NetworkApplyResult;
            setApplyResult(result);
            setStatus(result.dryRun ? "Network apply simulated (dry run)" : "Network settings applied");
        });
    }, [withBusy]);

    const onCreateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            setBusy(true);
            try {
                const created = (await GreetService.CreateDMXFixture(input as never)) as DMXFixture;
                await pullDMXState();
                setStatus(`Fixture "${created.name}" created`);
                setError("");
                return created;
            } catch (err) {
                setError(String(err));
                return null;
            } finally {
                setBusy(false);
            }
        },
        [ensureDMXEnabled, pullDMXState],
    );

    const onUpdateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            setBusy(true);
            try {
                const updated = (await GreetService.UpdateDMXFixture(input as never)) as DMXFixture;
                await pullDMXState();
                setStatus(`Fixture "${updated.name}" updated`);
                setError("");
                return updated;
            } catch (err) {
                setError(String(err));
                return null;
            } finally {
                setBusy(false);
            }
        },
        [ensureDMXEnabled, pullDMXState],
    );

    const onReaddressDMXFixtures = useCallback(
        async (updates: Array<{ id: string; dmxAddress: number }>, successLabel?: string): Promise<boolean> => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            const normalized = new Map<string, number>();
            for (const u of updates) {
                if (!u?.id) {
                    continue;
                }
                normalized.set(u.id, Math.max(1, Math.min(512, Math.round(u.dmxAddress) || 1)));
            }
            if (normalized.size === 0) {
                if (successLabel) {
                    setStatus(successLabel);
                    setError("");
                }
                return true;
            }

            const fixturesById = new Map(dmxState.fixtures.map((fixture) => [fixture.id, fixture]));
            setBusy(true);
            try {
                let changed = 0;
                for (const [id, dmxAddress] of normalized.entries()) {
                    const fixture = fixturesById.get(id);
                    if (!fixture || fixture.dmxAddress === dmxAddress) {
                        continue;
                    }
                    const input = fixtureToUpsertInput(fixture, dmxAddress);
                    await GreetService.UpdateDMXFixture(input as never);
                    changed += 1;
                }

                if (changed > 0) {
                    await pullDMXState();
                    setStatus(successLabel ?? `Readdressed ${changed} fixture${changed === 1 ? "" : "s"}`);
                    setError("");
                } else if (successLabel) {
                    setStatus(successLabel);
                    setError("");
                }
                return true;
            } catch (err) {
                setError(String(err));
                return false;
            } finally {
                setBusy(false);
            }
        },
        [dmxState.fixtures, ensureDMXEnabled, pullDMXState],
    );

    const onDeleteDMXFixture = useCallback(
        async (fixtureID: string): Promise<boolean> => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            setBusy(true);
            try {
                await GreetService.DeleteDMXFixture(fixtureID);
                await pullDMXState();
                setRoute((r) => (r.kind === "dmxFixture" && r.id === fixtureID ? {kind: "dmxAddFixture"} : r));
                setStatus("Fixture deleted");
                setError("");
                return true;
            } catch (err) {
                setError(String(err));
                return false;
            } finally {
                setBusy(false);
            }
        },
        [ensureDMXEnabled, pullDMXState],
    );

    const refreshUSBSerialDevices = useCallback(async () => {
        if (!ensureDMXEnabled()) {
            return;
        }
        setBusy(true);
        try {
            await pullUSBSerialDevices();
            setStatus("USB serial devices refreshed");
            setError("");
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    }, [ensureDMXEnabled, pullUSBSerialDevices]);

    const onSelectUSBSerialDevice = useCallback(async (deviceID: string) => {
        if (!ensureDMXEnabled()) {
            return;
        }
        setBusy(true);
        try {
            const next = (await GreetService.SetSelectedUSBSerialDevice(deviceID)) as DMXState;
            setDMXState(next);
            setStatus(deviceID ? "USB-DMX device selected" : "USB-DMX device selection cleared");
            setError("");
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    }, [ensureDMXEnabled]);

    const clampDmxByte = useCallback((v: number) => {
        const n = Math.round(v);
        return Math.max(0, Math.min(255, n));
    }, []);

    const pullDMXLiveStatus = useCallback(async () => {
        try {
            const st = (await GreetService.GetDMXLiveStatus()) as DMXLiveStatus;
            setDmxLiveStatus(st);
        } catch {
            setDmxLiveStatus(null);
        }
    }, []);

    const flushDmxLivePatch = useCallback(async () => {
        const m = dmxLivePendingRef.current;
        if (m.size === 0) {
            return;
        }
        dmxLivePendingRef.current = new Map();
        const updates = Array.from(m.entries()).map(
            ([address, value]) => new DMXOutputUpdate({address, value}),
        );
        try {
            await GreetService.ApplyDMXLivePatch(updates);
            await pullDMXLiveStatus();
        } catch (err) {
            setError(String(err));
            await pullDMXLiveStatus();
        }
    }, [pullDMXLiveStatus, setError]);

    const queueDmxLivePatch = useCallback(
        (entries: Array<{ address: number; value: number }>) => {
            for (const e of entries) {
                if (e.address >= 1 && e.address <= 512) {
                    dmxLivePendingRef.current.set(e.address, clampDmxByte(e.value));
                }
            }
            if (dmxLiveFlushTimerRef.current !== undefined) {
                window.clearTimeout(dmxLiveFlushTimerRef.current);
            }
            dmxLiveFlushTimerRef.current = window.setTimeout(() => {
                dmxLiveFlushTimerRef.current = undefined;
                void flushDmxLivePatch();
            }, 45);
        },
        [clampDmxByte, flushDmxLivePatch],
    );

    const startDMXLiveOutput = useCallback(
        async (fixtureID: string) => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            setBusy(true);
            try {
                await GreetService.StartDMXLive(fixtureID);
                setError("");
                setStatus("DMX live output started");
                await pullDMXLiveStatus();
                return true;
            } catch (err) {
                setError(String(err));
                await pullDMXLiveStatus();
                return false;
            } finally {
                setBusy(false);
            }
        },
        [ensureDMXEnabled, pullDMXLiveStatus, setBusy, setError, setStatus],
    );

    const stopDMXLiveOutput = useCallback(async () => {
        if (dmxLiveFlushTimerRef.current !== undefined) {
            window.clearTimeout(dmxLiveFlushTimerRef.current);
            dmxLiveFlushTimerRef.current = undefined;
        }
        dmxLivePendingRef.current.clear();
        try {
            await GreetService.StopDMXLive();
        } catch {
            /* ignore */
        }
        await pullDMXLiveStatus();
    }, [pullDMXLiveStatus]);

    const onDismissError = useCallback(() => {
        setError("");
    }, []);

    const onDiscoverNow = useCallback(() => {
        if (!ensureWLEDEnabled()) {
            return;
        }
        setDiscovering(true);
        void withBusy(async () => {
            try {
                await GreetService.DiscoverDevicesNow();
                await pullSnapshot();
                setStatus("Discovery complete");
            } finally {
                setDiscovering(false);
            }
        });
    }, [ensureWLEDEnabled, pullSnapshot, withBusy]);

    const onSetGlobalState = useCallback(
        (state: JSONMap, label: string, options?: { background?: boolean }) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            const background = options?.background === true;
            const run = async () => {
                const result = await GreetService.SetGlobalState(state);
                setStatus(`${label}: ${Object.keys(result).length} targets`);
                await pullSnapshot();
            };
            if (background) {
                void run().catch((err: unknown) => {
                    setError(String(err));
                });
                return;
            }
            void withBusy(run);
        },
        [ensureWLEDEnabled, pullSnapshot, withBusy],
    );

    const onRefreshDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            deviceDetailOpSeqRef.current += 1;
            void withBusy(async () => {
                setDeviceDetailReloading(true);
                try {
                    let refreshed: ControllerSnapshot | null = null;
                    let lastErr: unknown = null;
                    for (let attempt = 1; attempt <= DEVICE_DETAIL_MAX_TRIES; attempt++) {
                        setDeviceDetailFetchAttempt(attempt);
                        const p = GreetService.RefreshDevice(deviceID);
                        try {
                            refreshed = (await awaitCancellableWithTimeout(p, DEVICE_DETAIL_TRY_MS)) as unknown as ControllerSnapshot;
                            lastErr = null;
                            break;
                        } catch (e) {
                            lastErr = e;
                            if (attempt < DEVICE_DETAIL_MAX_TRIES) {
                                await sleep(DEVICE_DETAIL_RETRY_DELAY_MS);
                            }
                        }
                    }
                    if (!refreshed) {
                        throw lastErr ?? new Error("Device refresh failed");
                    }
                    setDeviceDetailFetchAttempt(0);
                    setSnapshot(refreshed);
                    setSettings(refreshed.settings);
                    setStatus(`Device refreshed`);
                    if (route.kind === "device" && route.id === deviceID) {
                        await loadDeviceDetail(deviceID, {
                            maxAttempts: DEVICE_DETAIL_MAX_TRIES,
                            showAttempts: true,
                        });
                    }
                } catch (e) {
                    setSnapshot((prev) => markDeviceOfflineInSnapshot(prev, deviceID));
                    if (route.kind === "device" && route.id === deviceID) {
                        setDeviceDetail({
                            online: false,
                            error: String(e),
                            address: "",
                            port: 80,
                        });
                        detailInitDoneRef.current = true;
                        setDeviceDetailInitializing(false);
                    }
                    throw e;
                } finally {
                    setDeviceDetailReloading(false);
                    setDeviceDetailFetchAttempt(0);
                }
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, route, withBusy],
    );

    const onProvisionDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            void withBusy(async () => {
                const updated = (await GreetService.ProvisionDevice(deviceID)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setStatus(`Device provisioned`);
                if (route.kind === "device" && route.id === deviceID) {
                    await loadDeviceDetail(deviceID);
                }
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, route, withBusy],
    );

    const onRemoveDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            void withBusy(async () => {
                const updated = (await GreetService.RemoveDevice(deviceID)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setStatus(`Device removed`);
                setRoute({kind: "presets"});
            });
        },
        [ensureWLEDEnabled, withBusy],
    );

    const onIgnoreDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            void withBusy(async () => {
                const updated = (await GreetService.SetDeviceIgnored(deviceID, true)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                try {
                    const ign = (await GreetService.GetIgnoredDevices()) as WLEDDevice[];
                    setIgnoredDevices(ign);
                } catch {
                    /* ignore */
                }
                setStatus("Device ignored");
                setRoute((r) => (r.kind === "device" && r.id === deviceID ? {kind: "presets"} : r));
            });
        },
        [ensureWLEDEnabled, withBusy],
    );

    const onUnignoreDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            void withBusy(async () => {
                const updated = (await GreetService.SetDeviceIgnored(deviceID, false)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                try {
                    const ign = (await GreetService.GetIgnoredDevices()) as WLEDDevice[];
                    setIgnoredDevices(ign);
                } catch {
                    /* ignore */
                }
                setStatus("Device restored from ignored list");
            });
        },
        [ensureWLEDEnabled, withBusy],
    );

    const onSetDeviceState = useCallback(
        (deviceID: string, state: JSONMap, options?: { skipFollowupDetailReload?: boolean }) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            const skipFollowupDetailReload = options?.skipFollowupDetailReload ?? false;
            if (typeof state.on === "boolean") {
                deviceAutoApplyBlockedForPowerOffRef.current = !state.on;
            }
            setDeviceDetail((prev) => {
                if (!prev || detailDeviceIdRef.current !== deviceID || !prev.state) {
                    return prev;
                }
                const optimistic = applyStatePatch(prev.state as JSONMap, state);
                return {
                    ...prev,
                    online: true,
                    error: "",
                    state: optimistic,
                };
            });
            pendingUiPatchRef.current = {patch: state, atMs: Date.now()};
            void (async () => {
                await GreetService.SetDeviceState(deviceID, state);
                if (!skipFollowupDetailReload) {
                    await pullSnapshot();
                    if (route.kind === "device" && route.id === deviceID) {
                        await loadDeviceDetail(deviceID);
                    }
                    setStatus(`Device updated`);
                }
            })().catch((err: unknown) => {
                setError(String(err));
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, pullSnapshot, route],
    );

    useEffect(() => {
        if (route.kind !== "device" || !selectedDevice) {
            return;
        }
        if (!deviceDetail?.state) {
            return;
        }
        if (detailDeviceIdRef.current !== route.id) {
            return;
        }
        const stLive = deviceDetail.state as JSONMap;
        if (typeof stLive.on === "boolean" && stLive.on === false) {
            return;
        }
        if (deviceStateAutoApplyHydrationSuppressRef.current > 0) {
            deviceStateAutoApplyHydrationSuppressRef.current -= 1;
            return;
        }
        const deviceID = selectedDevice.id;
        autoApplyPrevDepsRef.current = {
            rgb: [...deviceFormRgb],
            bri: deviceFormBri,
            transition: deviceFormTransition,
            sx: deviceFormSx,
            ix: deviceFormIx,
            segIdx: selectedSegIdx,
            selectedDeviceID: deviceID,
        };
        const sendAutoApply = () => {
            if (deviceAutoApplyBlockedForPowerOffRef.current) {
                const stAfterOff = deviceDetailRef.current?.state as JSONMap | undefined;
                if (typeof stAfterOff?.on === "boolean" && stAfterOff.on === false) {
                    deviceAutoApplyBlockedForPowerOffRef.current = false;
                }
                return;
            }
            const stNow = deviceDetailRef.current?.state as JSONMap | undefined;
            if (typeof stNow?.on === "boolean" && stNow.on === false) {
                return;
            }
            const autoPatch: JSONMap = {
                bri: deviceFormBri,
                transition: deviceFormTransition,
                seg: [
                    {
                        id: selectedSegIdx,
                        col: [deviceFormRgb],
                        sx: deviceFormSx,
                        ix: deviceFormIx,
                    },
                ],
            };
            if (stNow && isPatchSatisfiedByState(stNow, autoPatch)) {
                return;
            }
            // Omit `on` so we do not force strips on; bri/seg only.
            onSetDeviceState(deviceID, autoPatch, {skipFollowupDetailReload: true});
            lastDeviceAutoApplySentAtMsRef.current = Date.now();
        };

        // Keep slider interactions responsive while preventing UI/backend flood.
        const throttleMs = 120;
        const elapsedMs = Date.now() - lastDeviceAutoApplySentAtMsRef.current;
        if (elapsedMs >= throttleMs) {
            sendAutoApply();
            return;
        }
        const t = window.setTimeout(sendAutoApply, throttleMs - elapsedMs);
        return () => window.clearTimeout(t);
    }, [
        deviceFormBri,
        deviceFormIx,
        deviceFormRgb,
        deviceFormSx,
        deviceFormTransition,
        onSetDeviceState,
        route,
        selectedDevice,
        selectedSegIdx,
    ]);

    const onRenameDevice = useCallback(
        (deviceID: string, name: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            void withBusy(async () => {
                const updated = (await GreetService.RenameDevice(deviceID, name)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setEditingDeviceName(false);
                setStatus("Device name updated");
                setError("");
                if (route.kind === "device" && route.id === deviceID) {
                    await loadDeviceDetail(deviceID);
                }
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, route, withBusy],
    );

    const onToggleOneDevice = useCallback(
        (deviceID: string) => {
            onSetDeviceState(deviceID, {on: "t"});
        },
        [onSetDeviceState],
    );

    const applyWarmWhitePreset = useCallback(() => {
        presetColorAutoApplySkipRef.current = true;
        setPresetRgb([...WARM_WHITE_RGB]);
        onSetGlobalState(warmWhiteState(presetBri), "Warm white (all)");
    }, [onSetGlobalState, presetBri]);

    const applyColdWhitePreset = useCallback(() => {
        presetColorAutoApplySkipRef.current = true;
        setPresetRgb([...COLD_WHITE_RGB]);
        onSetGlobalState(coldWhiteState(presetBri), "Cold white (all)");
    }, [onSetGlobalState, presetBri]);

    const applyNamedColorPreset = useCallback(
        (label: string, rgb: [number, number, number]) => {
            presetColorAutoApplySkipRef.current = true;
            setPresetRgb([...rgb]);
            onSetGlobalState(rgbState(rgb[0], rgb[1], rgb[2], presetBri, true), `${label} (all)`);
        },
        [onSetGlobalState, presetBri],
    );

    useEffect(() => {
        if (presetColorAutoApplyIsInitialRef.current) {
            presetColorAutoApplyIsInitialRef.current = false;
            return;
        }
        if (presetColorAutoApplySkipRef.current) {
            presetColorAutoApplySkipRef.current = false;
            return;
        }
        const t = window.setTimeout(() => {
            const [r, g, b] = presetRgb;
            onSetGlobalState(rgbState(r, g, b, presetBri, true), "All devices color", {background: true});
        }, 200);
        return () => window.clearTimeout(t);
    }, [onSetGlobalState, presetBri, presetRgb]);

    return {
        snapshot,
        settings,
        setSettings,
        applyResult,
        status,
        error,
        statePayloadText,
        setStatePayloadText,
        configPatchText,
        setConfigPatchText,
        presetBri,
        setPresetBri,
        presetRgb,
        setPresetRgb,
        generalFx,
        setGeneralFx,
        generalPal,
        setGeneralPal,
        generalSx,
        setGeneralSx,
        generalIx,
        setGeneralIx,
        busy,
        discovering,
        wledEnabled,
        dmxEnabled,
        currentVersion,
        dmxState,
        dmxLiveStatus,
        usbSerialDevices,
        route,
        setRoute,
        deviceDetail,
        deviceDetailInitializing,
        deviceDetailReloading,
        deviceDetailFetchAttempt,
        deviceDetailFetchMax: DEVICE_DETAIL_MAX_TRIES,
        deviceFormFx,
        setDeviceFormFx,
        deviceFormPal,
        setDeviceFormPal,
        deviceFormSx,
        setDeviceFormSx,
        deviceFormIx,
        setDeviceFormIx,
        deviceFormRgb,
        setDeviceFormRgb,
        deviceFormBri,
        setDeviceFormBri,
        deviceFormTransition,
        setDeviceFormTransition,
        selectedSegIdx,
        setSelectedSegIdx,
        ignoredDevices,
        deviceNameDraft,
        setDeviceNameDraft,
        editingDeviceName,
        setEditingDeviceName,
        devices,
        selectedDevice,
        selectedFixture,
        pullSnapshot,
        markSettingsInteraction,
        pullDMXState,
        pullUSBSerialDevices,
        onSaveSettings,
        onApplyNetwork,
        onDiscoverNow,
        onSetGlobalState,
        onRefreshDevice,
        onProvisionDevice,
        onRemoveDevice,
        onIgnoreDevice,
        onUnignoreDevice,
        onSetDeviceState,
        onRenameDevice,
        onToggleOneDevice,
        applyWarmWhitePreset,
        applyColdWhitePreset,
        applyNamedColorPreset,
        onCreateDMXFixture,
        onUpdateDMXFixture,
        onReaddressDMXFixtures,
        onDeleteDMXFixture,
        refreshUSBSerialDevices,
        onSelectUSBSerialDevice,
        pullDMXLiveStatus,
        queueDmxLivePatch,
        startDMXLiveOutput,
        stopDMXLiveOutput,
        onDismissError,
        consoleEntries,
        consoleLastId,
        consoleDetached,
        onClearConsole,
        openDetachedConsoleWindow,
        closeDetachedConsoleWindow,
    };
}

function buildAuthoritativePatch(form: {
    bri: number;
    transition: number;
    fx: number;
    pal: number;
    sx: number;
    ix: number;
    rgb: [number, number, number];
    segIdx: number;
}): JSONMap {
    return {
        bri: form.bri,
        transition: form.transition,
        seg: [
            {
                id: form.segIdx,
                fx: form.fx,
                pal: form.pal,
                sx: form.sx,
                ix: form.ix,
                col: [form.rgb],
            },
        ],
    };
}

function fixtureToUpsertInput(fixture: DMXFixture, dmxAddress: number): UpsertDMXFixtureInput {
    return {
        id: fixture.id,
        type: fixture.type,
        brand: fixture.brand,
        name: fixture.name,
        dmxAddress,
        maxPan: fixture.movingHead?.maxPan ?? 540,
        maxTilt: fixture.movingHead?.maxTilt ?? 270,
        channels: fixture.channels,
    };
}

function applyStatePatch(current: JSONMap, patch: JSONMap): JSONMap {
    const next: JSONMap = {...current, ...patch};
    if (!Array.isArray(patch.seg)) {
        return next;
    }
    const baseSeg = Array.isArray(current.seg) ? [...current.seg] : [];
    const patchSeg = patch.seg as unknown[];
    for (const raw of patchSeg) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            continue;
        }
        const segPatch = raw as JSONMap;
        const id = readNumber(segPatch.id, -1);
        if (id < 0) {
            continue;
        }
        const idx = baseSeg.findIndex((s) => {
            if (!s || typeof s !== "object" || Array.isArray(s)) {
                return false;
            }
            return readNumber((s as JSONMap).id, -1) === id;
        });
        if (idx >= 0) {
            const curr = baseSeg[idx] as JSONMap;
            baseSeg[idx] = {...curr, ...segPatch};
        } else {
            baseSeg.push(segPatch);
        }
    }
    next.seg = baseSeg;
    return next;
}

function isPatchSatisfiedByState(state: JSONMap, patch: JSONMap): boolean {
    for (const [key, value] of Object.entries(patch)) {
        if (key === "seg") {
            const patchSegList = Array.isArray(value) ? value : [];
            const stateSegList = Array.isArray(state.seg) ? state.seg : [];
            for (const segRaw of patchSegList) {
                if (!segRaw || typeof segRaw !== "object" || Array.isArray(segRaw)) {
                    continue;
                }
                const segPatch = segRaw as JSONMap;
                const segID = readNumber(segPatch.id, -1);
                if (segID < 0) {
                    continue;
                }
                const stateSeg = stateSegList.find((s) => {
                    if (!s || typeof s !== "object" || Array.isArray(s)) {
                        return false;
                    }
                    return readNumber((s as JSONMap).id, -1) === segID;
                }) as JSONMap | undefined;
                if (!stateSeg) {
                    return false;
                }
                for (const [segKey, segValue] of Object.entries(segPatch)) {
                    if (segKey === "id") {
                        continue;
                    }
                    if (JSON.stringify(stateSeg[segKey]) !== JSON.stringify(segValue)) {
                        return false;
                    }
                }
            }
            continue;
        }
        if (JSON.stringify(state[key]) !== JSON.stringify(value)) {
            return false;
        }
    }
    return true;
}

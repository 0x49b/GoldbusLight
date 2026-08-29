import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import i18n from "../i18n";
import {useShallow} from "zustand/shallow";
import * as GoldbusLightService from "../../bindings/goldbus/internal/service/goldbuslightservice";
import {DMXLiveStatus, DMXOutputUpdate} from "../../bindings/goldbus/internal/dmx/models";
import {
    DMXPartyConfig as DMXPartyConfigModel,
} from "../../bindings/goldbus/internal/controller/models";
import {useControllerStore} from "../store/controllerStore";
import {parseJSONMap, prettyJSON, readNumber} from "../lib/json";
import {universeInterfaceSettings} from "../lib/dmxUniverses";
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
  DMXPartyAudioInputDevice,
  DMXPartyConfig,
  DMXPartyMode,
  DMXPartyState,
  DMXState,
  JSONMap,
  LightingScene,
  NetworkApplyResult,
  UpsertDMXFixtureInput,
  UpsertLightingSceneInput,
  USBSerialDevice,
  WLEDDevice,
  WLEDDeviceDetail,
  WLEDDevicePreset,
} from "../types/controller";

const DEVICE_DETAIL_MAX_TRIES = 5;
const DEVICE_DETAIL_TRY_MS = 10_000;
const DEVICE_DETAIL_RETRY_DELAY_MS = 400;

/** Background snapshot poll to pick up devices coming back online (matches header Refresh data). */
const BACKGROUND_SNAPSHOT_POLL_MS = 30_000;
const PARTY_STATUS_POLL_MS = 1500;
const PARTY_AUDIO_FAST_POLL_MS = 100;

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
        updatesSupported,
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
        setUpdatesSupported,
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
            updatesSupported: s.updatesSupported,
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
            setUpdatesSupported: s.setUpdatesSupported,
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
    const generalEffectAutoApplyIsInitialRef = useRef(true);
    const globalApplyPendingRef = useRef<JSONMap | null>(null);
    const globalApplyTimerRef = useRef<number | undefined>(undefined);
    const lastGlobalApplySentAtMsRef = useRef(0);
    const partyConfigSendRef = useRef<DMXPartyConfig | null>(null);
    const partyConfigTimerRef = useRef<number | undefined>(undefined);
    const lastPartyConfigSentAtMsRef = useRef(0);
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

    const dmxLivePendingRef = useRef<Map<string, number>>(new Map());
    const dmxLiveFlushTimerRef = useRef<number | undefined>(undefined);
    const [dmxLiveStatus, setDmxLiveStatus] = useState<DMXLiveStatus | null>(null);
    const [partyAudioInputDevices, setPartyAudioInputDevices] = useState<DMXPartyAudioInputDevice[]>([]);
    const settingsEditLockUntilRef = useRef(0);

    const markSettingsInteraction = useCallback((holdMs = 5000) => {
        const now = Date.now();
        const until = now + Math.max(250, holdMs);
        settingsEditLockUntilRef.current = Math.max(settingsEditLockUntilRef.current, until);
    }, []);

    const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);
    const scenes = useMemo(() => snapshot?.scenes ?? [], [snapshot]);

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
    const dmxPartyState = dmxState.party;

    const wledEnabled = settings?.wled.enabled ?? true;
    const dmxEnabled = settings?.dmx.enabled ?? true;

    useEffect(() => {
        if (!settings) {
            return;
        }
        setRoute((prev) => {
            if (!settings.wled.enabled && (prev.kind === "presets" || prev.kind === "device" || prev.kind === "wledAddDevice")) {
                return {kind: "settings"};
            }
            if (!settings.dmx.enabled && (prev.kind === "dmxUniverse" || prev.kind === "dmxAddFixture" || prev.kind === "dmxFixture")) {
                return {kind: "settings"};
            }
            if (prev.kind === "scenes" && !settings.wled.enabled && !settings.dmx.enabled) {
                return {kind: "settings"};
            }
            if (prev.kind === "settings" && prev.tab === "party" && !settings.wled.enabled && !settings.dmx.enabled) {
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
        const next = (await GoldbusLightService.GetDMXState()) as DMXState;
        if (!next.universes?.length) {
            next.universes = [{id: "universe-1", name: i18n.t("status:universe1")}];
        }
        setDMXState((prev) => {
            const pendingConfig = partyConfigSendRef.current;
            const nextParty = pendingConfig ? {...next.party, config: pendingConfig} : next.party;
            const prevParty = prev.party;
            const prevStopped = !prevParty.config.enabled && !prevParty.status.running;
            const nextRunning = !!(nextParty.config?.enabled && nextParty.status?.running);
            if (prevStopped && nextRunning) {
                return {...next, party: prevParty};
            }
            return {...next, party: nextParty};
        });
        return next;
    }, []);

    const pullDMXPartyState = useCallback(async () => {
        const state = (await GoldbusLightService.GetDMXPartyState()) as unknown as DMXPartyState;
        setDMXState((prev) => {
            const pendingConfig = partyConfigSendRef.current;
            return {
                ...prev,
                party: pendingConfig ? {...state, config: pendingConfig} : state,
            };
        });
        return state;
    }, [setDMXState]);

    const pullUSBSerialDevices = useCallback(async () => {
        const devices = (await GoldbusLightService.ListUSBSerialDevices()) as USBSerialDevice[];
        setUSBSerialDevices(devices);
        return devices;
    }, []);

    const pullPartyAudioInputDevices = useCallback(async () => {
        try {
            const devices = (await GoldbusLightService.ListDMXPartyAudioInputDevices()) as DMXPartyAudioInputDevice[];
            setPartyAudioInputDevices(devices);
            return devices;
        } catch {
            setPartyAudioInputDevices([]);
            return [];
        }
    }, []);

    const pullSnapshot = useCallback(async () => {
        const next = (await GoldbusLightService.GetControllerSnapshot()) as unknown as ControllerSnapshot;
        setSnapshot(next);
        const settingsEditingActive = Date.now() < settingsEditLockUntilRef.current;
        if (!settingsEditingActive) {
            setSettings(next.settings);
            setStatePayloadText(prettyJSON(next.settings.wled.provisioning.defaultStatePayload ?? {}));
            setConfigPatchText(prettyJSON(next.settings.wled.provisioning.defaultConfigPatch ?? {}));
        }
        setStatus(i18n.t("status:updatedAt", {time: new Date(next.updatedAt).toLocaleTimeString()}));
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
            const ign = (await GoldbusLightService.GetIgnoredDevices()) as WLEDDevice[];
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
        try {
            const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
            setDmxLiveStatus(st);
        } catch {
            setDmxLiveStatus(null);
        }
        try {
            await pullPartyAudioInputDevices();
        } catch {
            setPartyAudioInputDevices([]);
        }
    }, [pullDMXState, pullPartyAudioInputDevices, pullUSBSerialDevices]);

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

    // Refresh snapshot when opening Scenes so companion/manual clears of activeSceneId are visible.
    useEffect(() => {
        if (route.kind !== "scenes") {
            return;
        }
        void pullSnapshot().catch(() => {
            /* ignore — background poll will retry */
        });
    }, [route.kind, pullSnapshot]);

    useEffect(() => {
        void pullPartyAudioInputDevices().catch(() => {
            setPartyAudioInputDevices([]);
        });
    }, [pullPartyAudioInputDevices]);

    const pullConsoleEntries = useCallback(async () => {
        const latest = useControllerStore.getState();
        const afterID = latest.consoleLastId;
        try {
            const next = (await GoldbusLightService.ListConsoleEntries(afterID, 200)) as ConsoleEntry[];
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
            const detached = await GoldbusLightService.IsConsoleWindowDetached();
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
        void GoldbusLightService.ClearConsoleEntries().catch(() => {
            /* ignore */
        });
    }, [setConsoleEntries]);

    const openDetachedConsoleWindow = useCallback(() => {
        void GoldbusLightService.OpenDetachedConsoleWindow()
            .then(() => setConsoleDetached(true))
            .catch(() => {
                /* ignore */
            });
    }, [setConsoleDetached]);

    const closeDetachedConsoleWindow = useCallback(() => {
        void GoldbusLightService.CloseDetachedConsoleWindow()
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
            setStatus(i18n.t("status:deviceGone"));
        }
    }, [route, snapshot, setRoute, setStatus]);

    useEffect(() => {
        void Promise.all([GoldbusLightService.AppVersion(), GoldbusLightService.UpdatesSupported()])
            .then(([version, supported]) => {
                if (version && version.trim() !== "") {
                    setCurrentVersion(version);
                }
                setUpdatesSupported(supported);
            })
            .catch(() => {
            });
    }, [setCurrentVersion, setUpdatesSupported]);

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
                    void GoldbusLightService.SetDeviceState(deviceId, authoritativePatch).catch((err: unknown) => {
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
            const rawP = GoldbusLightService.GetDeviceDetail(deviceId);
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
        // Clear prior device detail so we never flash another device's live state.
        // Cached lastState on the device list still powers the UI while we fetch.
        if (detailDeviceIdRef.current !== route.id) {
            setDeviceDetail(null);
        }
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

    const runAsync = useCallback((work: () => Promise<void>) => {
        void work().catch((err: unknown) => {
            setError(String(err));
        });
    }, [setError]);

    const ensureWLEDEnabled = useCallback((): boolean => {
        if ((settings?.wled.enabled ?? true) === false) {
            setError(i18n.t("status:wledDisabled"));
            return false;
        }
        return true;
    }, [settings?.wled.enabled, setError]);

    const ensureDMXEnabled = useCallback((): boolean => {
        if ((settings?.dmx.enabled ?? true) === false) {
            setError(i18n.t("status:dmxDisabled"));
            return false;
        }
        return true;
    }, [settings?.dmx.enabled, setError]);

    const ensurePartyEnabled = useCallback((): boolean => {
        const dmxOn = settings?.dmx.enabled ?? true;
        const wledOn = settings?.wled.enabled ?? true;
        if (!dmxOn && !wledOn) {
            setError(i18n.t("status:partyRequiresComponent"));
            return false;
        }
        return true;
    }, [settings?.dmx.enabled, settings?.wled.enabled, setError]);

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

            const saved = (await GoldbusLightService.SaveControllerSettings(merged as never)) as unknown as ControllerSnapshot;
            setSnapshot(saved);
            setSettings(saved.settings);
            try {
                const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
                setDmxLiveStatus(st);
            } catch {
                setDmxLiveStatus(null);
            }
            setStatus(i18n.t("status:settingsSaved"));
            setError("");
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        }
    }, []);

    const onApplyNetwork = useCallback(() => {
        runAsync(async () => {
            const result = (await GoldbusLightService.ApplyNetworkSettings()) as NetworkApplyResult;
            setApplyResult(result);
            setStatus(result.dryRun ? i18n.t("status:networkApplyDryRun") : i18n.t("status:networkApplyApplied"));
        });
    }, [runAsync]);

    const onExportConfigurationBackup = useCallback(async (): Promise<string> => {
        try {
            const path = await GoldbusLightService.ExportConfigurationBackup();
            const msg = i18n.t("status:configExported", {path});
            setStatus(msg);
            setError("");
            return msg;
        } catch (err) {
            if (String(err).includes("configuration backup cancelled")) {
                return i18n.t("status:exportCancelled");
            }
            throw err;
        }
    }, [setStatus, setError]);

    const onCreateWLEDDevicePreset = useCallback(
        async (deviceID: string, name: string): Promise<WLEDDevicePreset> => {
            const preset = (await GoldbusLightService.CreateWLEDDevicePreset(deviceID, name)) as unknown as WLEDDevicePreset;
            await pullSnapshot();
            setStatus(i18n.t("status:presetSaved", {name}));
            return preset;
        },
        [pullSnapshot, setStatus],
    );

    const onDeleteWLEDDevicePreset = useCallback(
        async (deviceID: string, presetID: string) => {
            const updated = (await GoldbusLightService.DeleteWLEDDevicePreset(deviceID, presetID)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            setStatus(i18n.t("status:presetDeleted"));
        },
        [setSnapshot, setStatus],
    );

    const onApplyWLEDDevicePreset = useCallback(
        async (deviceID: string, presetID: string) => {
            const updated = (await GoldbusLightService.ApplyWLEDDevicePreset(deviceID, presetID)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            setStatus(i18n.t("status:presetApplied"));
        },
        [setSnapshot, setStatus],
    );

    const onCreateLightingScene = useCallback(
        async (input: UpsertLightingSceneInput): Promise<LightingScene> => {
            const scene = (await GoldbusLightService.CreateLightingScene(input as never)) as unknown as LightingScene;
            await pullSnapshot();
            setStatus(i18n.t("status:sceneCreated", {name: scene.name}));
            return scene;
        },
        [pullSnapshot, setStatus],
    );

    const onUpdateLightingScene = useCallback(
        async (input: UpsertLightingSceneInput): Promise<LightingScene> => {
            const scene = (await GoldbusLightService.UpdateLightingScene(input as never)) as unknown as LightingScene;
            await pullSnapshot();
            setStatus(i18n.t("status:sceneSaved", {name: scene.name}));
            return scene;
        },
        [pullSnapshot, setStatus],
    );

    const onDeleteLightingScene = useCallback(
        async (id: string) => {
            const updated = (await GoldbusLightService.DeleteLightingScene(id)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            setStatus(i18n.t("status:sceneDeleted"));
        },
        [setSnapshot, setStatus],
    );

    const onApplyLightingScene = useCallback(
        async (id: string) => {
            const updated = (await GoldbusLightService.ApplyLightingScene(id)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            try {
                await pullDMXPartyState();
            } catch {
                /* party may already be stopped */
            }
            setStatus(i18n.t("status:sceneApplied"));
        },
        [pullDMXPartyState, setSnapshot, setStatus],
    );

    const onSetDefaultLightingScene = useCallback(
        async (id: string) => {
            const updated = (await GoldbusLightService.SetDefaultLightingScene(id)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            setStatus(id ? i18n.t("status:startupSceneSet") : i18n.t("status:startupSceneCleared"));
        },
        [setSnapshot, setStatus],
    );

    const onSetPartyLightingScene = useCallback(
        async (id: string) => {
            const updated = (await GoldbusLightService.SetPartyLightingScene(id)) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            setStatus(id ? i18n.t("status:partySceneSet") : i18n.t("status:partySceneCleared"));
        },
        [setSnapshot, setStatus],
    );

    const onStartLightingSceneParty = useCallback(
        async () => {
            const updated = (await GoldbusLightService.StartLightingSceneParty()) as unknown as ControllerSnapshot;
            setSnapshot(updated);
            await pullDMXPartyState();
            setStatus(i18n.t("status:partyStartedFromScene"));
        },
        [pullDMXPartyState, setSnapshot, setStatus],
    );

    const onExportLightingScene = useCallback(
        async (id: string): Promise<string> => {
            try {
                const path = await GoldbusLightService.ExportLightingScene(id);
                const msg = i18n.t("status:sceneExported", {path});
                setStatus(msg);
                setError("");
                return msg;
            } catch (err) {
                if (String(err).includes("configuration backup cancelled")) {
                    return i18n.t("status:exportCancelled");
                }
                throw err;
            }
        },
        [setStatus, setError],
    );

    const onImportLightingScene = useCallback(async (): Promise<LightingScene | null> => {
        try {
            const scene = (await GoldbusLightService.ImportLightingScene()) as unknown as LightingScene;
            await pullSnapshot();
            try {
                await pullDMXState();
            } catch {
                /* fixtures may have gained cues */
            }
            setStatus(i18n.t("status:sceneImported", {name: scene.name}));
            return scene;
        } catch (err) {
            if (String(err).includes("configuration backup cancelled")) {
                return null;
            }
            throw err;
        }
    }, [pullDMXState, pullSnapshot, setStatus]);

    const onExportDMXFixtureConfig = useCallback(
        async (suggestedFilename: string, contents: string): Promise<string> => {
            try {
                const path = await GoldbusLightService.ExportDMXFixtureConfig(suggestedFilename, contents);
                const msg = i18n.t("status:fixtureExported", {path});
                setStatus(msg);
                setError("");
                return msg;
            } catch (err) {
                if (String(err).includes("configuration backup cancelled")) {
                    return i18n.t("status:exportCancelled");
                }
                throw err;
            }
        },
        [setStatus, setError],
    );

    const onImportConfigurationBackup = useCallback(async (): Promise<string> => {
        try {
            await GoldbusLightService.ImportConfigurationBackup();
            await pullSnapshot();
            await pullDMXState();
            await pullDMXPartyState();
            const msg = i18n.t("status:configImported");
            setStatus(msg);
            setError("");
            return msg;
        } catch (err) {
            if (String(err).includes("configuration backup cancelled")) {
                return i18n.t("status:importCancelled");
            }
            throw err;
        }
    }, [pullSnapshot, pullDMXState, pullDMXPartyState, setStatus, setError]);

    const onCheckForUpdates = useCallback(async (): Promise<void> => {
        await GoldbusLightService.CheckForUpdates();
    }, []);

    const onCreateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            try {
                const created = (await GoldbusLightService.CreateDMXFixture(input as never)) as DMXFixture;
                await pullDMXState();
                setStatus(i18n.t("status:fixtureCreated", {name: created.name}));
                setError("");
                return created;
            } catch (err) {
                setError(String(err));
                return null;
            }
        },
        [ensureDMXEnabled, pullDMXState, setError],
    );

    const onUpdateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            try {
                const updated = (await GoldbusLightService.UpdateDMXFixture(input as never)) as DMXFixture;
                if (dmxLiveStatus?.connected && dmxLiveStatus.fixtureId === updated.id) {
                    await GoldbusLightService.StartDMXLive(updated.id);
                    try {
                        const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
                        setDmxLiveStatus(st);
                    } catch {
                        setDmxLiveStatus(null);
                    }
                }
                await pullDMXState();
                setStatus(i18n.t("status:fixtureUpdated", {name: updated.name}));
                setError("");
                return updated;
            } catch (err) {
                setError(String(err));
                return null;
            }
        },
        [dmxLiveStatus?.connected, dmxLiveStatus?.fixtureId, ensureDMXEnabled, pullDMXState, setError],
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
            try {
                let changed = 0;
                for (const [id, dmxAddress] of normalized.entries()) {
                    const fixture = fixturesById.get(id);
                    if (!fixture || fixture.dmxAddress === dmxAddress) {
                        continue;
                    }
                    const input = fixtureToUpsertInput(fixture, dmxAddress);
                    await GoldbusLightService.UpdateDMXFixture(input as never);
                    changed += 1;
                }

                if (changed > 0) {
                    if (dmxLiveStatus?.connected && dmxLiveStatus.fixtureId && normalized.has(dmxLiveStatus.fixtureId)) {
                        await GoldbusLightService.StartDMXLive(dmxLiveStatus.fixtureId);
                        try {
                            const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
                            setDmxLiveStatus(st);
                        } catch {
                            setDmxLiveStatus(null);
                        }
                    }
                    await pullDMXState();
                    setStatus(successLabel ?? i18n.t("status:readdressedFixtures", {count: changed}));
                    setError("");
                } else if (successLabel) {
                    setStatus(successLabel);
                    setError("");
                }
                return true;
            } catch (err) {
                setError(String(err));
                return false;
            }
        },
        [dmxLiveStatus?.connected, dmxLiveStatus?.fixtureId, dmxState.fixtures, ensureDMXEnabled, pullDMXState, setError],
    );

    const onDeleteDMXFixture = useCallback(
        async (fixtureID: string): Promise<boolean> => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            try {
                await GoldbusLightService.DeleteDMXFixture(fixtureID);
                await pullDMXState();
                setRoute((r) => (r.kind === "dmxFixture" && r.id === fixtureID ? {kind: "dmxAddFixture"} : r));
                setStatus(i18n.t("status:fixtureDeleted"));
                setError("");
                return true;
            } catch (err) {
                setError(String(err));
                return false;
            }
        },
        [ensureDMXEnabled, pullDMXState, setError, setRoute],
    );

    const refreshUSBSerialDevices = useCallback(async () => {
        if (!ensureDMXEnabled()) {
            return;
        }
        try {
            await pullUSBSerialDevices();
            setStatus(i18n.t("status:usbSerialRefreshed"));
            setError("");
        } catch (err) {
            setError(String(err));
        }
    }, [ensureDMXEnabled, pullUSBSerialDevices, setError]);

    const onSelectUSBSerialDevice = useCallback(async (deviceID: string, _universeId = "universe-1") => {
        if (!ensureDMXEnabled()) {
            return;
        }
        try {
            const next = (await GoldbusLightService.SetDMXUniverseUSBDevice("universe-1", deviceID)) as DMXState;
            setDMXState(next);
            setSettings((prev) => {
                if (!prev) {
                    return prev;
                }
                const current = universeInterfaceSettings(prev, "universe-1", next);
                return {
                    ...prev,
                    dmx: {
                        ...prev.dmx,
                        universeInterfaces: {
                            "universe-1": {
                                ...current,
                                selectedUSBDeviceId: deviceID,
                            },
                        },
                    },
                };
            });
            try {
                const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
                setDmxLiveStatus(st);
            } catch {
                setDmxLiveStatus(null);
            }
            setStatus(deviceID ? i18n.t("status:usbDmxSelected") : i18n.t("status:usbDmxCleared"));
            setError("");
        } catch (err) {
            setError(String(err));
        }
    }, [ensureDMXEnabled, setDMXState, setError, setSettings]);

    const flushPartyConfigSend = useCallback(
        async (label?: string) => {
            if (partyConfigTimerRef.current !== undefined) {
                window.clearTimeout(partyConfigTimerRef.current);
                partyConfigTimerRef.current = undefined;
            }
            const config = partyConfigSendRef.current;
            if (!config) {
                return;
            }
            lastPartyConfigSentAtMsRef.current = Date.now();
            try {
                const next = await GoldbusLightService.SetDMXPartyConfig(new DMXPartyConfigModel(config as never));
                if (partyConfigSendRef.current === config) {
                    partyConfigSendRef.current = null;
                }
                setDMXState((prev) => {
                    const pending = partyConfigSendRef.current;
                    const server = next as unknown as DMXPartyState;
                    return {
                        ...prev,
                        party: pending ? {...server, config: pending} : server,
                    };
                });
                if (label) {
                    setStatus(label);
                }
                setError("");
            } catch (err: unknown) {
                setError(String(err));
            }
        },
        [setDMXState, setError, setStatus],
    );

    const setDMXPartyConfig = useCallback(
        async (partial: Partial<DMXPartyConfig>, options?: { immediate?: boolean }) => {
            if (!ensurePartyEnabled()) {
                return false;
            }
            const base = useControllerStore.getState().dmxState.party?.config;
            const merged = mergeDMXPartyConfig(base, partial);
            setDMXState((prev) => ({
                ...prev,
                party: {
                    ...prev.party,
                    config: merged,
                },
            }));
            partyConfigSendRef.current = merged;

            const targetIdsChanged =
                Object.prototype.hasOwnProperty.call(partial, "wledDeviceIds") ||
                Object.prototype.hasOwnProperty.call(partial, "fixtureIds");
            if (options?.immediate || targetIdsChanged) {
                await flushPartyConfigSend();
                return true;
            }

            const throttleMs = 120;
            const elapsedMs = Date.now() - lastPartyConfigSentAtMsRef.current;
            if (elapsedMs >= throttleMs) {
                void flushPartyConfigSend();
                return true;
            }
            if (partyConfigTimerRef.current !== undefined) {
                window.clearTimeout(partyConfigTimerRef.current);
            }
            partyConfigTimerRef.current = window.setTimeout(() => {
                partyConfigTimerRef.current = undefined;
                void flushPartyConfigSend();
            }, throttleMs - elapsedMs);
            return true;
        },
        [ensurePartyEnabled, flushPartyConfigSend, setDMXState],
    );

    const startDMXPartyMode = useCallback(async () => {
        if (!ensurePartyEnabled()) {
            return false;
        }
        try {
            await setDMXPartyConfig({}, {immediate: true});
            await GoldbusLightService.StartDMXParty();
            const state = await GoldbusLightService.GetDMXPartyState();
            setDMXState((prev) => ({...prev, party: state as unknown as DMXPartyState}));
            setStatus(i18n.t("status:partyStarted"));
            setError("");
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        }
    }, [ensurePartyEnabled, setDMXState, setError, setStatus, setDMXPartyConfig]);

    const stopDMXPartyMode = useCallback(async () => {
        if (partyConfigTimerRef.current !== undefined) {
            window.clearTimeout(partyConfigTimerRef.current);
            partyConfigTimerRef.current = undefined;
        }
        partyConfigSendRef.current = null;
        setDMXState((prev) => ({
            ...prev,
            party: {
                ...prev.party,
                config: {...prev.party.config, enabled: false},
                status: {
                    ...prev.party.status,
                    running: false,
                    partyBlocksManualPatch: false,
                },
            },
        }));
        try {
            await GoldbusLightService.StopDMXParty();
            const state = (await GoldbusLightService.GetDMXPartyState()) as unknown as DMXPartyState;
            setDMXState((prev) => ({...prev, party: state}));
            setStatus(i18n.t("status:partyStopped"));
            setError("");
        } catch (err) {
            setError(String(err));
            try {
                const state = (await GoldbusLightService.GetDMXPartyState()) as unknown as DMXPartyState;
                setDMXState((prev) => ({...prev, party: state}));
            } catch {
                /* ignore follow-up read failure */
            }
        }
    }, [setDMXState, setError, setStatus]);

    useEffect(() => {
        if (dmxPartyState?.status?.running !== true) {
            return;
        }
        void pullDMXPartyState().catch(() => {
            /* ignore transient errors */
        });
        const timer = window.setInterval(() => {
            void pullDMXPartyState().catch(() => {
                /* ignore transient errors */
            });
        }, PARTY_STATUS_POLL_MS);
        return () => window.clearInterval(timer);
    }, [dmxPartyState?.status?.running, pullDMXPartyState]);

    useEffect(() => {
        const shouldFastPoll = route.kind === "settings" || (dmxPartyState?.status?.running === true && dmxPartyState?.config?.mode === "audio");
        if (!shouldFastPoll) {
            return;
        }
        const timer = window.setInterval(() => {
            void pullDMXPartyState().catch(() => {
                /* ignore transient errors */
            });
        }, PARTY_AUDIO_FAST_POLL_MS);
        return () => window.clearInterval(timer);
    }, [route.kind, dmxPartyState?.status?.running, dmxPartyState?.config?.mode, pullDMXPartyState]);

    const clampDmxByte = useCallback((v: number) => {
        const n = Math.round(v);
        return Math.max(0, Math.min(255, n));
    }, []);

    const pullDMXLiveStatus = useCallback(async () => {
        try {
            const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
            setDmxLiveStatus(st);
        } catch {
            setDmxLiveStatus(null);
        }
    }, []);

    const triggerDMXEmergency = useCallback(async () => {
        if (dmxLiveFlushTimerRef.current !== undefined) {
            window.clearTimeout(dmxLiveFlushTimerRef.current);
            dmxLiveFlushTimerRef.current = undefined;
        }
        dmxLivePendingRef.current.clear();
        setDMXState((prev) => ({
            ...prev,
            party: {
                ...prev.party,
                config: {...prev.party.config, enabled: false},
                status: {
                    ...prev.party.status,
                    running: false,
                    partyBlocksManualPatch: false,
                },
            },
        }));
        try {
            await GoldbusLightService.DMXEmergencyStop();
            await pullDMXState();
            const state = (await GoldbusLightService.GetDMXPartyState()) as unknown as DMXPartyState;
            setDMXState((prev) => ({...prev, party: state}));
            await pullDMXLiveStatus();
            setStatus(i18n.t("status:emergencyStop"));
            setError("");
        } catch (err) {
            setError(String(err));
            try {
                const state = (await GoldbusLightService.GetDMXPartyState()) as unknown as DMXPartyState;
                setDMXState((prev) => ({...prev, party: state}));
            } catch {
                /* ignore follow-up read failure */
            }
            await pullDMXLiveStatus();
        }
    }, [pullDMXLiveStatus, pullDMXState, setDMXState, setError, setStatus]);

    const flushDmxLivePatch = useCallback(async () => {
        const m = dmxLivePendingRef.current;
        if (m.size === 0) {
            return;
        }
        dmxLivePendingRef.current = new Map();
        const updates = Array.from(m.entries()).map(([key, value]) => {
            const [universeId, addressRaw] = key.split(":");
            const address = Number(addressRaw);
            return new DMXOutputUpdate({
                universeId: universeId || "universe-1",
                address,
                value,
            });
        });
        try {
            await GoldbusLightService.ApplyDMXLivePatch(updates);
            setSnapshot((prev) => clearActiveSceneInSnapshot(prev));
            await pullDMXLiveStatus();
        } catch (err) {
            const errMsg = String(err);
            if (!errMsg.includes("not running")) {
                setError(errMsg);
            }
            await pullDMXLiveStatus();
        }
    }, [pullDMXLiveStatus, setError, setSnapshot]);

    const queueDmxLivePatch = useCallback(
        (entries: Array<{ address: number; value: number; universeId?: string }>, universeId = "universe-1") => {
            if (dmxPartyState?.status?.running === true) {
                return;
            }
            for (const e of entries) {
                if (e.address >= 1 && e.address <= 512) {
                    const u = (e.universeId ?? universeId) || "universe-1";
                    dmxLivePendingRef.current.set(`${u}:${e.address}`, clampDmxByte(e.value));
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
        [clampDmxByte, dmxPartyState?.status?.running, flushDmxLivePatch],
    );

    const startDMXLiveOutput = useCallback(
        async (fixtureID: string) => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            try {
                await GoldbusLightService.StartDMXLive(fixtureID);
                setError("");
                setStatus(i18n.t("status:dmxLiveStarted"));
                await pullDMXLiveStatus();
                return true;
            } catch (err) {
                setError(String(err));
                await pullDMXLiveStatus();
                return false;
            }
        },
        [ensureDMXEnabled, pullDMXLiveStatus, setError, setStatus],
    );

    const stopDMXLiveOutput = useCallback(async () => {
        if (dmxLiveFlushTimerRef.current !== undefined) {
            window.clearTimeout(dmxLiveFlushTimerRef.current);
            dmxLiveFlushTimerRef.current = undefined;
        }
        dmxLivePendingRef.current = new Map();
        try {
            await GoldbusLightService.StopDMXLive();
        } catch {
            /* ignore */
        }
        await pullDMXLiveStatus();
    }, [pullDMXLiveStatus]);

    const onDismissError = useCallback(() => {
        setError("");
    }, []);

    const onAddWLEDDevice = useCallback(
        async (address: string, port: number): Promise<string | null> => {
            if (!ensureWLEDEnabled()) {
                return null;
            }
            try {
                const created = (await GoldbusLightService.AddWLEDDevice({address, port})) as { id: string };
                await pullSnapshot();
                setStatus(i18n.t("status:wledDeviceAdded"));
                return created.id;
            } catch (err) {
                setError(String(err));
                return null;
            }
        },
        [ensureWLEDEnabled, pullSnapshot, setError, setStatus],
    );

    const sendGlobalState = useCallback(
        async (patch: JSONMap, label: string, skipSnapshotReload: boolean) => {
            try {
                const result = await GoldbusLightService.SetGlobalState(patch);
                if (!skipSnapshotReload) {
                    await pullSnapshot();
                    setStatus(i18n.t("status:globalTargets", {label, count: Object.keys(result).length}));
                }
            } catch (err: unknown) {
                setError(String(err));
            }
        },
        [pullSnapshot, setError, setStatus],
    );

    const flushThrottledGlobalApply = useCallback(
        (label: string) => {
            if (globalApplyTimerRef.current !== undefined) {
                window.clearTimeout(globalApplyTimerRef.current);
                globalApplyTimerRef.current = undefined;
            }
            const pending = globalApplyPendingRef.current;
            globalApplyPendingRef.current = null;
            if (!pending) {
                return;
            }
            lastGlobalApplySentAtMsRef.current = Date.now();
            void sendGlobalState(pending, label, true);
        },
        [sendGlobalState],
    );

    const onSetGlobalState = useCallback(
        (state: JSONMap, label: string, options?: { skipSnapshotReload?: boolean }) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            const skipSnapshotReload = options?.skipSnapshotReload === true;
            const normalized = normalizeGlobalStatePatch(state);

            setSnapshot((prev) => applyGlobalPatchToSnapshot(prev, normalized));

            if (skipSnapshotReload) {
                globalApplyPendingRef.current = globalApplyPendingRef.current
                    ? applyStatePatch(globalApplyPendingRef.current, normalized)
                    : normalized;
                const throttleMs = 120;
                const elapsedMs = Date.now() - lastGlobalApplySentAtMsRef.current;
                if (elapsedMs >= throttleMs) {
                    flushThrottledGlobalApply(label);
                    return;
                }
                if (globalApplyTimerRef.current !== undefined) {
                    window.clearTimeout(globalApplyTimerRef.current);
                }
                globalApplyTimerRef.current = window.setTimeout(
                    () => flushThrottledGlobalApply(label),
                    throttleMs - elapsedMs,
                );
                return;
            }

            if (globalApplyTimerRef.current !== undefined) {
                window.clearTimeout(globalApplyTimerRef.current);
                globalApplyTimerRef.current = undefined;
            }
            globalApplyPendingRef.current = null;
            void sendGlobalState(normalized, label, false);
        },
        [ensureWLEDEnabled, flushThrottledGlobalApply, sendGlobalState],
    );

    const onRefreshDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            deviceDetailOpSeqRef.current += 1;
            runAsync(async () => {
                setDeviceDetailReloading(true);
                try {
                    let refreshed: ControllerSnapshot | null = null;
                    let lastErr: unknown = null;
                    for (let attempt = 1; attempt <= DEVICE_DETAIL_MAX_TRIES; attempt++) {
                        setDeviceDetailFetchAttempt(attempt);
                        const p = GoldbusLightService.RefreshDevice(deviceID);
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
                        throw lastErr ?? new Error(i18n.t("status:deviceRefreshFailed"));
                    }
                    setDeviceDetailFetchAttempt(0);
                    setSnapshot(refreshed);
                    setSettings(refreshed.settings);
                    setStatus(i18n.t("status:deviceRefreshed"));
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
        [ensureWLEDEnabled, loadDeviceDetail, route, runAsync],
    );

    const onProvisionDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            runAsync(async () => {
                const updated = (await GoldbusLightService.ProvisionDevice(deviceID)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setStatus(i18n.t("status:deviceProvisioned"));
                if (route.kind === "device" && route.id === deviceID) {
                    await loadDeviceDetail(deviceID);
                }
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, route, runAsync],
    );

    const onRemoveDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            runAsync(async () => {
                const updated = (await GoldbusLightService.RemoveDevice(deviceID)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setStatus(i18n.t("status:deviceRemoved"));
                setRoute({kind: "presets"});
            });
        },
        [ensureWLEDEnabled, runAsync, setRoute],
    );

    const onIgnoreDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            runAsync(async () => {
                const updated = (await GoldbusLightService.SetDeviceIgnored(deviceID, true)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                try {
                    const ign = (await GoldbusLightService.GetIgnoredDevices()) as WLEDDevice[];
                    setIgnoredDevices(ign);
                } catch {
                    /* ignore */
                }
                setStatus(i18n.t("status:deviceIgnored"));
                setRoute((r) => (r.kind === "device" && r.id === deviceID ? {kind: "presets"} : r));
            });
        },
        [ensureWLEDEnabled, runAsync, setRoute],
    );

    const onUnignoreDevice = useCallback(
        (deviceID: string) => {
            if (!ensureWLEDEnabled()) {
                return;
            }
            runAsync(async () => {
                const updated = (await GoldbusLightService.SetDeviceIgnored(deviceID, false)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                try {
                    const ign = (await GoldbusLightService.GetIgnoredDevices()) as WLEDDevice[];
                    setIgnoredDevices(ign);
                } catch {
                    /* ignore */
                }
                setStatus(i18n.t("status:deviceRestored"));
            });
        },
        [ensureWLEDEnabled, runAsync],
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
                await GoldbusLightService.SetDeviceState(deviceID, state);
                setSnapshot((prev) => clearActiveSceneInSnapshot(prev));
                if (!skipFollowupDetailReload) {
                    await pullSnapshot();
                    if (route.kind === "device" && route.id === deviceID) {
                        await loadDeviceDetail(deviceID);
                    }
                    setStatus(i18n.t("status:deviceUpdated"));
                }
            })().catch((err: unknown) => {
                setError(String(err));
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, pullSnapshot, route, setSnapshot],
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
            runAsync(async () => {
                const updated = (await GoldbusLightService.RenameDevice(deviceID, name)) as unknown as ControllerSnapshot;
                setSnapshot(updated);
                setSettings(updated.settings);
                setEditingDeviceName(false);
                setStatus(i18n.t("status:deviceNameUpdated"));
                setError("");
                if (route.kind === "device" && route.id === deviceID) {
                    await loadDeviceDetail(deviceID);
                }
            });
        },
        [ensureWLEDEnabled, loadDeviceDetail, route, runAsync],
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
        onSetGlobalState(warmWhiteState(presetBri), i18n.t("status:warmWhiteAll"));
    }, [onSetGlobalState, presetBri]);

    const applyColdWhitePreset = useCallback(() => {
        presetColorAutoApplySkipRef.current = true;
        setPresetRgb([...COLD_WHITE_RGB]);
        onSetGlobalState(coldWhiteState(presetBri), i18n.t("status:coldWhiteAll"));
    }, [onSetGlobalState, presetBri]);

    const applyNamedColorPreset = useCallback(
        (label: string, rgb: [number, number, number]) => {
            presetColorAutoApplySkipRef.current = true;
            setPresetRgb([...rgb]);
            onSetGlobalState(rgbState(rgb[0], rgb[1], rgb[2], presetBri, true), i18n.t("status:labelAll", {label}));
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
            onSetGlobalState(rgbState(r, g, b, presetBri, true), i18n.t("status:allDevicesColor"), {skipSnapshotReload: true});
        }, 200);
        return () => window.clearTimeout(t);
    }, [onSetGlobalState, presetBri, presetRgb]);

    useEffect(() => {
        if (generalEffectAutoApplyIsInitialRef.current) {
            generalEffectAutoApplyIsInitialRef.current = false;
            return;
        }
        const patch: JSONMap = {
            seg: [{id: 0, fx: generalFx, pal: generalPal, sx: generalSx, ix: generalIx}],
        };
        onSetGlobalState(patch, i18n.t("status:effectPaletteAll"), {skipSnapshotReload: true});
    }, [generalFx, generalPal, generalSx, generalIx, onSetGlobalState]);

    return {
        snapshot,
        settings,
        setSettings,
        applyResult,
        status,
        error,
        setError,
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
        wledEnabled,
        dmxEnabled,
        currentVersion,
        updatesSupported,
        dmxState,
        dmxPartyState,
        dmxLiveStatus,
        usbSerialDevices,
        partyAudioInputDevices,
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
        scenes,
        selectedDevice,
        selectedFixture,
        pullSnapshot,
        markSettingsInteraction,
        pullDMXState,
        pullDMXPartyState,
        pullPartyAudioInputDevices,
        pullUSBSerialDevices,
        onSaveSettings,
        onApplyNetwork,
        onAddWLEDDevice,
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
        onCreateWLEDDevicePreset,
        onDeleteWLEDDevicePreset,
        onApplyWLEDDevicePreset,
        onCreateLightingScene,
        onUpdateLightingScene,
        onDeleteLightingScene,
        onApplyLightingScene,
        onSetDefaultLightingScene,
        onSetPartyLightingScene,
        onStartLightingSceneParty,
        onExportLightingScene,
        onImportLightingScene,
        onCreateDMXFixture,
        onUpdateDMXFixture,
        onReaddressDMXFixtures,
        onDeleteDMXFixture,
        refreshUSBSerialDevices,
        onSelectUSBSerialDevice,
        setDMXPartyConfig,
        startDMXPartyMode,
        stopDMXPartyMode,
        triggerDMXEmergency,
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
        onExportConfigurationBackup,
        onExportDMXFixtureConfig,
        onImportConfigurationBackup,
        onCheckForUpdates,
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
        masterFixtureId: fixture.masterFixtureId,
        maxPan: fixture.movingHead?.maxPan ?? 540,
        maxTilt: fixture.movingHead?.maxTilt ?? 270,
        party: fixture.party,
        colorSweep: fixture.colorSweep,
        sceneCues: fixture.sceneCues,
        channels: fixture.channels,
    };
}

function normalizeGlobalStatePatch(patch: JSONMap): JSONMap {
    if (!Array.isArray(patch.seg)) {
        return patch;
    }
    const seg = (patch.seg as unknown[]).map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return raw;
        }
        const segPatch = raw as JSONMap;
        if (readNumber(segPatch.id, -1) >= 0) {
            return segPatch;
        }
        return {id: 0, ...segPatch};
    });
    return {...patch, seg};
}

function applyGlobalPatchToSnapshot(
    snapshot: ControllerSnapshot | null,
    patch: JSONMap,
): ControllerSnapshot | null {
    if (!snapshot) {
        return snapshot;
    }
    return {
        ...snapshot,
        activeSceneId: "",
        devices: snapshot.devices.map((device) => {
            if (device.ignored) {
                return device;
            }
            const lastState = (device.lastState as JSONMap | undefined) ?? {};
            return {
                ...device,
                lastState: applyStatePatch(lastState, patch),
            };
        }),
    };
}

function clearActiveSceneInSnapshot(snapshot: ControllerSnapshot | null): ControllerSnapshot | null {
    if (!snapshot || !snapshot.activeSceneId) {
        return snapshot;
    }
    return {...snapshot, activeSceneId: ""};
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

function clampPercent(v: number, fallback: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.max(0, Math.min(100, n));
}

function clampMs(v: number, min: number, max: number, fallback: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.max(min, Math.min(max, n));
}

function clampMovementAngleLimit(v: number, fallback: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.max(0, Math.min(360, n));
}

function mergePartyChannelGroups(
    base: DMXPartyConfig["channelGroups"] | undefined,
    partial: Partial<DMXPartyConfig["channelGroups"]> | undefined,
): DMXPartyConfig["channelGroups"] | undefined {
    if (!base && !partial) {
        return undefined;
    }
    return {...base, ...partial};
}

function mergePartyWLEDDeviceSettings(
    base: DMXPartyConfig["wledDeviceSettings"] | undefined,
    partial: DMXPartyConfig["wledDeviceSettings"] | undefined,
    deviceIds: string[],
): DMXPartyConfig["wledDeviceSettings"] | undefined {
    if (!base && !partial) {
        return undefined;
    }
    const merged = {...base, ...partial};
    const allowed = new Set(deviceIds);
    const out: NonNullable<DMXPartyConfig["wledDeviceSettings"]> = {};
    for (const [id, settings] of Object.entries(merged)) {
        if (!allowed.has(id) || !settings) {
            continue;
        }
        out[id] = {
            fx: Math.max(0, Math.round(Number.isFinite(settings.fx) ? settings.fx : 0)),
            pal: Math.max(0, Math.round(Number.isFinite(settings.pal) ? settings.pal : 0)),
            sx: clampByte(settings.sx ?? 128, 128),
            ix: clampByte(settings.ix ?? 128, 128),
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function clampByte(v: number, fallback: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.max(0, Math.min(255, n));
}

function mergeDMXPartyConfig(base: DMXPartyConfig | undefined, partial: Partial<DMXPartyConfig>): DMXPartyConfig {
    const modeRaw = partial.mode ?? base?.mode ?? "auto";
    const mode: DMXPartyMode = modeRaw === "audio" ? "audio" : "auto";
    const fixtureIds = Array.from(
        new Set(
            (partial.fixtureIds ?? base?.fixtureIds ?? [])
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
        ),
    );
    const wledDeviceIds = Array.from(
        new Set(
            (partial.wledDeviceIds ?? base?.wledDeviceIds ?? [])
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
        ),
    );
    const intensity = clampPercent(partial.intensity ?? base?.intensity ?? 80, 80);
    const speed = clampPercent(partial.speed ?? base?.speed ?? 55, 55);
    const wledBrightness = clampByte(
        partial.wledBrightness ?? base?.wledBrightness ?? Math.round((intensity / 100) * 255),
        200,
    );
    const wledSpeed = clampByte(
        partial.wledSpeed ?? base?.wledSpeed ?? Math.round((speed / 100) * 255),
        128,
    );
    return {
        enabled: partial.enabled ?? base?.enabled ?? false,
        mode,
        fixtureIds,
        wledDeviceIds,
        wledDeviceSettings: mergePartyWLEDDeviceSettings(
            base?.wledDeviceSettings,
            partial.wledDeviceSettings,
            wledDeviceIds,
        ),
        wledBrightness,
        wledSpeed,
        intensity,
        speed,
        movementRange: clampPercent(partial.movementRange ?? base?.movementRange ?? 70, 70),
        movementAngleLimitDeg: clampMovementAngleLimit(
            partial.movementAngleLimitDeg ?? base?.movementAngleLimitDeg ?? 45,
            45,
        ),
        channelGroups: mergePartyChannelGroups(base?.channelGroups, partial.channelGroups),
        colorVariation: clampPercent(partial.colorVariation ?? base?.colorVariation ?? 70, 70),
        audioSensitivity: clampPercent(partial.audioSensitivity ?? base?.audioSensitivity ?? 60, 60),
        audioInputDeviceId: (partial.audioInputDeviceId ?? base?.audioInputDeviceId ?? "").trim(),
        smokeBurstOnMs: clampMs(partial.smokeBurstOnMs ?? base?.smokeBurstOnMs ?? 2500, 200, 15000, 2500),
        smokeBurstOffMs: clampMs(partial.smokeBurstOffMs ?? base?.smokeBurstOffMs ?? 45000, 1000, 300000, 45000),
        smokeVolume: clampPercent(partial.smokeVolume ?? base?.smokeVolume ?? 55, 55),
    };
}

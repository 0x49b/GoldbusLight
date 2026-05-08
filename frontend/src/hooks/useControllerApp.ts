import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as GreetService from "../../bindings/changeme/greetservice";
import { parseJSONMap, prettyJSON, readNumber } from "../lib/json";
import {
  mainSegIndex,
  rgbFromSegment,
  rgbState,
  segmentAt,
  segmentFx,
  segmentIx,
  segmentPal,
  segmentSx,
  COLD_WHITE_RGB,
  WARM_WHITE_RGB,
  coldWhiteState,
  warmWhiteState,
} from "../lib/wled";
import type {
  ControllerSettings,
  ControllerSnapshot,
  DetailRoute,
  JSONMap,
  NetworkApplyResult,
  WLEDDevice,
  WLEDDeviceDetail,
} from "../types/controller";

export function useControllerApp() {
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [applyResult, setApplyResult] = useState<NetworkApplyResult | null>(null);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string>("");
  const [statePayloadText, setStatePayloadText] = useState<string>('{"on":true,"bri":180}');
  const [configPatchText, setConfigPatchText] = useState<string>("{}");
  const [presetBri, setPresetBri] = useState<number>(200);
  const [presetRgb, setPresetRgb] = useState<[number, number, number]>([...WARM_WHITE_RGB]);
  const [generalFx, setGeneralFx] = useState<number>(0);
  const [generalPal, setGeneralPal] = useState<number>(0);
  const [generalSx, setGeneralSx] = useState<number>(128);
  const [generalIx, setGeneralIx] = useState<number>(128);
  const [busy, setBusy] = useState<boolean>(false);
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [route, setRoute] = useState<DetailRoute>({ kind: "presets" });
  const [deviceDetail, setDeviceDetail] = useState<WLEDDeviceDetail | null>(null);
  const [deviceDetailInitializing, setDeviceDetailInitializing] = useState(false);
  const [deviceDetailReloading, setDeviceDetailReloading] = useState(false);
  const [deviceFormFx, setDeviceFormFx] = useState(0);
  const [deviceFormPal, setDeviceFormPal] = useState(0);
  const [deviceFormSx, setDeviceFormSx] = useState(128);
  const [deviceFormIx, setDeviceFormIx] = useState(128);
  const [deviceFormRgb, setDeviceFormRgb] = useState<[number, number, number]>([255, 0, 0]);
  const [deviceFormBri, setDeviceFormBri] = useState(180);
  const [deviceFormTransition, setDeviceFormTransition] = useState(7);
  const [selectedSegIdx, setSelectedSegIdx] = useState(0);
  const [ignoredDevices, setIgnoredDevices] = useState<WLEDDevice[]>([]);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("unknown");

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

  const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);

  const selectedDevice = useMemo(() => {
    if (route.kind !== "device") return undefined;
    return devices.find((d) => d.id === route.id);
  }, [devices, route]);

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

  const pullSnapshot = useCallback(async () => {
    const next = (await GreetService.GetControllerSnapshot()) as ControllerSnapshot;
    setSnapshot(next);
    setSettings(next.settings);
    setStatePayloadText(prettyJSON(next.settings.provisioning.defaultStatePayload ?? {}));
    setConfigPatchText(prettyJSON(next.settings.provisioning.defaultConfigPatch ?? {}));
    setStatus(`Updated ${new Date(next.updatedAt).toLocaleTimeString()}`);
    setError("");
    const gst = (next as ControllerSnapshot & {
      generalTabState?: { bri?: unknown; rgb?: unknown; fx?: unknown; pal?: unknown; sx?: unknown; ix?: unknown };
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
  }, []);

  useEffect(() => {
    void pullSnapshot().catch((err: unknown) => {
      setError(String(err));
    });
    const timer = window.setInterval(() => {
      void pullSnapshot().catch((err: unknown) => {
        setError(String(err));
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [pullSnapshot]);

  useEffect(() => {
    void GreetService.AppVersion()
      .then((version) => {
        if (version && version.trim() !== "") {
          setCurrentVersion(version);
        }
      })
      .catch(() => {});
  }, []);

  const loadDeviceDetail = useCallback(async (deviceId: string) => {
    try {
      const prevDetailId = detailDeviceIdRef.current;
      const d = (await GreetService.GetDeviceDetail(deviceId)) as WLEDDeviceDetail;
      const isInitialLoad = !detailInitDoneRef.current;
      if (isInitialLoad && d.state) {
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
        const resendAllowed = now-lastAuthoritativeResendAtMsRef.current > 250;
        if (resendAllowed) {
          lastAuthoritativeResendAtMsRef.current = now;
          pendingUiPatchRef.current = { patch: authoritativePatch, atMs: now };
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
    } catch (e) {
      setDeviceDetail({
        online: false,
        error: String(e),
        address: "",
        port: 80,
      });
    }
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
      setDeviceDetail(null);
      detailDeviceIdRef.current = "";
      detailInitDoneRef.current = false;
      setDeviceDetailInitializing(false);
      return;
    }
    detailInitDoneRef.current = false;
    setDeviceDetailInitializing(true);
    void loadDeviceDetail(route.id);
    const t = window.setInterval(() => {
      void loadDeviceDetail(route.id);
    }, 5000);
    return () => window.clearInterval(t);
  }, [route, loadDeviceDetail]);

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

  const onSaveSettings = useCallback(() => {
    if (!settings) {
      return;
    }
    void withBusy(async () => {
      const statePayload = parseJSONMap(statePayloadText);
      const configPatch = parseJSONMap(configPatchText);

      const merged: ControllerSettings = {
        ...settings,
        provisioning: {
          ...settings.provisioning,
          defaultStatePayload: statePayload,
          defaultConfigPatch: configPatch,
        },
      };

      const saved = (await GreetService.SaveControllerSettings(merged)) as ControllerSnapshot;
      setSnapshot(saved);
      setSettings(saved.settings);
      setStatus("Settings saved");
      setError("");
    });
  }, [configPatchText, settings, statePayloadText, withBusy]);

  const onApplyNetwork = useCallback(() => {
    void withBusy(async () => {
      const result = (await GreetService.ApplyNetworkSettings()) as NetworkApplyResult;
      setApplyResult(result);
      setStatus(result.dryRun ? "Network apply simulated (dry run)" : "Network settings applied");
    });
  }, [withBusy]);

  const onDismissError = useCallback(() => {
    setError("");
  }, []);

  const onDiscoverNow = useCallback(() => {
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
  }, [pullSnapshot, withBusy]);

  const onSetGlobalState = useCallback(
    (state: JSONMap, label: string, options?: { background?: boolean }) => {
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
    [pullSnapshot, withBusy],
  );

  const onRefreshDevice = useCallback(
    (deviceID: string) => {
      setDeviceDetailReloading(true);
      void withBusy(async () => {
        try {
          const refreshed = (await GreetService.RefreshDevice(deviceID)) as ControllerSnapshot;
          setSnapshot(refreshed);
          setSettings(refreshed.settings);
          setStatus(`Device refreshed`);
          if (route.kind === "device" && route.id === deviceID) {
            await loadDeviceDetail(deviceID);
          }
        } finally {
          setDeviceDetailReloading(false);
        }
      });
    },
    [loadDeviceDetail, route, withBusy],
  );

  const onProvisionDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.ProvisionDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(updated);
        setSettings(updated.settings);
        setStatus(`Device provisioned`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
        }
      });
    },
    [loadDeviceDetail, route, withBusy],
  );

  const onRemoveDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.RemoveDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(updated);
        setSettings(updated.settings);
        setStatus(`Device removed`);
        setRoute({ kind: "presets" });
      });
    },
    [withBusy],
  );

  const onIgnoreDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.SetDeviceIgnored(deviceID, true)) as ControllerSnapshot;
        setSnapshot(updated);
        setSettings(updated.settings);
        try {
          const ign = (await GreetService.GetIgnoredDevices()) as WLEDDevice[];
          setIgnoredDevices(ign);
        } catch {
          /* ignore */
        }
        setStatus("Device ignored");
        setRoute((r) => (r.kind === "device" && r.id === deviceID ? { kind: "presets" } : r));
      });
    },
    [withBusy],
  );

  const onUnignoreDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const updated = (await GreetService.SetDeviceIgnored(deviceID, false)) as ControllerSnapshot;
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
    [withBusy],
  );

  const onSetDeviceState = useCallback(
    (deviceID: string, state: JSONMap, options?: { skipFollowupDetailReload?: boolean }) => {
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
      pendingUiPatchRef.current = { patch: state, atMs: Date.now() };
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
    [loadDeviceDetail, pullSnapshot, route],
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
      onSetDeviceState(deviceID, autoPatch, { skipFollowupDetailReload: true });
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
      void withBusy(async () => {
        const updated = (await GreetService.RenameDevice(deviceID, name)) as ControllerSnapshot;
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
    [loadDeviceDetail, route, withBusy],
  );

  const onToggleOneDevice = useCallback(
    (deviceID: string) => {
      onSetDeviceState(deviceID, { on: "t" });
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
      onSetGlobalState(rgbState(r, g, b, presetBri, true), "All devices color", { background: true });
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
    currentVersion,
    route,
    setRoute,
    deviceDetail,
    deviceDetailInitializing,
    deviceDetailReloading,
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
    pullSnapshot,
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
    onDismissError,
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

function applyStatePatch(current: JSONMap, patch: JSONMap): JSONMap {
  const next: JSONMap = { ...current, ...patch };
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
      baseSeg[idx] = { ...curr, ...segPatch };
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


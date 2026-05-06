import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as GreetService from "../../bindings/changeme/greetservice";
import * as UpdaterDiagnosticsService from "../../bindings/changeme/updaterdiagnosticsservice";
import * as SelfUpdateService from "../../bindings/github.com/wailsapp/wails/v3/pkg/services/selfupdate/service";
import type { UpdateInfo } from "../../bindings/github.com/wailsapp/wails/v3/pkg/services/selfupdate/models";
import type { PathPermissionDiagnostic, UpdatePermissionDiagnostics } from "../../bindings/changeme/models";
import { Events } from "@wailsio/runtime";
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
  const [busy, setBusy] = useState<boolean>(false);
  const [route, setRoute] = useState<DetailRoute>({ kind: "presets" });
  const [deviceDetail, setDeviceDetail] = useState<WLEDDeviceDetail | null>(null);
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
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateAction, setUpdateAction] = useState<"check" | "install" | null>(null);
  const [startupUpdateModalOpen, setStartupUpdateModalOpen] = useState(false);
  const [updateDiagnostics, setUpdateDiagnostics] = useState<UpdatePermissionDiagnostics | null>(null);

  const detailDeviceIdRef = useRef<string>("");
  /** Latest GET /json/state for the open device (for debounced callbacks; avoids stale closures). */
  const deviceDetailRef = useRef<WLEDDeviceDetail | null>(null);
  /** After user sets `on: false`, block bri/seg auto-apply until GET state reflects off (stale timer / bri waking strip). */
  const deviceAutoApplyBlockedForPowerOffRef = useRef(false);
  /** After hydrating the form from GET state, skip the next N auto-apply runs (server push + follow-up form render). */
  const deviceStateAutoApplyHydrationSuppressRef = useRef(0);
  const presetColorAutoApplySkipRef = useRef(false);
  const presetColorAutoApplyIsInitialRef = useRef(true);

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
    void SelfUpdateService.GetCurrentVersion()
      .then((version) => {
        if (version && version.trim() !== "") {
          setCurrentVersion(version);
        }
      })
      .catch(() => {});
  }, []);

  const checkForUpdates = useCallback(
    async (trigger: "startup" | "manual") => {
      console.info("[updater] check.start", { trigger });
      if (trigger === "manual") {
        setUpdateBusy(true);
        setUpdateAction("check");
        setUpdateProgress(null);
      }
      try {
        const info = await SelfUpdateService.Check();
        setUpdateInfo(info);
        console.info("[updater] check.result", {
          trigger,
          updateAvailable: info?.updateAvailable,
          latestVersion: info?.latestVersion,
          currentVersion: info?.currentVersion,
          assetName: info?.assetName,
        });
        if (info?.currentVersion && info.currentVersion.trim() !== "") {
          setCurrentVersion(info.currentVersion);
        }
        if (!info || !info.updateAvailable) {
          if (trigger === "manual") {
            setStatus("No update available");
          }
        } else {
          setStatus(`Update available: ${info.latestVersion}`);
          if (trigger === "startup") {
            setStartupUpdateModalOpen(true);
          }
        }
      } catch (err: unknown) {
        console.error("[updater] check.error", { trigger, error: String(err) });
        setError(String(err));
      } finally {
        if (trigger === "manual") {
          setUpdateBusy(false);
          setUpdateAction(null);
        }
      }
    },
    [],
  );

  const fetchUpdateDiagnostics = useCallback(async () => {
    try {
      const diag = await UpdaterDiagnosticsService.GetUpdatePermissionDiagnostics();
      setUpdateDiagnostics(diag);
      console.info("[updater] diagnostics", diag);
      return diag;
    } catch (err) {
      console.warn("[updater] diagnostics.error", { error: String(err) });
      return null;
    }
  }, []);

  const firstNonWritablePath = useCallback((diag: UpdatePermissionDiagnostics | null): PathPermissionDiagnostic | null => {
    if (!diag) return null;
    return diag.paths.find((p) => !p.writable) ?? null;
  }, []);

  useEffect(() => {
    void checkForUpdates("startup");
  }, [checkForUpdates]);

  useEffect(() => {
    const unsubscribe = Events.On("selfupdate:progress", (payload: unknown) => {
      const root = (payload ?? {}) as Record<string, unknown>;
      const evt = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;

      const percentage = Number(evt.percentage ?? evt.Percentage);
      if (Number.isFinite(percentage)) {
        setUpdateProgress(Math.max(0, Math.min(100, percentage)));
        return;
      }

      const downloaded = Number(evt.downloadedBytes ?? evt.DownloadedBytes);
      const total = Number(evt.totalBytes ?? evt.TotalBytes);
      if (Number.isFinite(downloaded) && Number.isFinite(total) && total > 0) {
        setUpdateProgress(Math.max(0, Math.min(100, (downloaded / total) * 100)));
      }
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const loadDeviceDetail = useCallback(async (deviceId: string) => {
    try {
      const prevDetailId = detailDeviceIdRef.current;
      const d = (await GreetService.GetDeviceDetail(deviceId)) as WLEDDeviceDetail;
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
    deviceStateAutoApplyHydrationSuppressRef.current += 1;
    setDeviceFormFx(segmentFx(seg));
    setDeviceFormPal(segmentPal(seg));
    setDeviceFormSx(segmentSx(seg));
    setDeviceFormIx(segmentIx(seg));
    setDeviceFormRgb(rgbFromSegment(seg));
    setDeviceFormBri(readNumber(st.bri, 180));
    setDeviceFormTransition(readNumber(st.transition, 7));
  }, [deviceDetail, selectedSegIdx]);

  useEffect(() => {
    if (route.kind !== "device") {
      setDeviceDetail(null);
      detailDeviceIdRef.current = "";
      return;
    }
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

  const onCheckForUpdates = useCallback(() => {
    void checkForUpdates("manual");
  }, [checkForUpdates]);

  const onDownloadAndInstallUpdate = useCallback(() => {
    if (!updateInfo?.updateAvailable) {
      return;
    }
    setUpdateBusy(true);
    setUpdateAction("install");
    setUpdateProgress(0);
    console.info("[updater] install.start", { latestVersion: updateInfo.latestVersion });
    void Promise.all([SelfUpdateService.CanUpdate(), SelfUpdateService.GetPlatformInfo(), fetchUpdateDiagnostics()])
      .then(([canUpdate, platform, diag]) => {
        console.info("[updater] install.preflight", { canUpdate, platform, diagnostics: diag });
        if (!canUpdate) {
          const failingPath = firstNonWritablePath(diag);
          if (failingPath) {
            throw new Error(
              `Updater cannot write to installation directory. user=${diag?.username || diag?.runtimeUid} path=${failingPath.path} mode=${failingPath.mode || "unknown"} owner=${failingPath.ownerUid ?? "?"}:${failingPath.ownerGid ?? "?"}. Run scripts/fix-raspi-update-state.sh.`,
            );
          }
          throw new Error("Updater cannot write to installation directory. Run scripts/fix-raspi-update-state.sh.");
        }
        return SelfUpdateService.DownloadAndInstall();
      })
      .then(async (updated) => {
        console.info("[updater] install.result", { updated });
        if (!updated) {
          setStatus("No update was applied");
          return;
        }
        setStatus("Update installed. Restarting...");
        console.info("[updater] restart.trigger");
        await SelfUpdateService.Restart();
      })
      .catch(async (err: unknown) => {
        const diag = await fetchUpdateDiagnostics();
        console.error("[updater] install.error", { error: String(err), diagnostics: diag });
        const failingPath = firstNonWritablePath(diag);
        if (failingPath) {
          setError(
            `${String(err)} (failing path: ${failingPath.path}, owner: ${failingPath.ownerUid ?? "?"}:${failingPath.ownerGid ?? "?"}, mode: ${failingPath.mode || "unknown"})`,
          );
          return;
        }
        setError(String(err));
      })
      .finally(() => {
        setUpdateBusy(false);
        setUpdateAction(null);
      });
  }, [updateInfo?.updateAvailable]);

  const onPostponeUpdate = useCallback(() => {
    setStartupUpdateModalOpen(false);
  }, []);

  const onDismissError = useCallback(() => {
    setError("");
  }, []);

  const onDiscoverNow = useCallback(() => {
    void withBusy(async () => {
      await GreetService.DiscoverDevicesNow();
      await pullSnapshot();
      setStatus("Discovery complete");
    });
  }, [pullSnapshot, withBusy]);

  const onSetGlobalState = useCallback(
    (state: JSONMap, label: string) => {
      void withBusy(async () => {
        const result = await GreetService.SetGlobalState(state);
        setStatus(`${label}: ${Object.keys(result).length} targets`);
        await pullSnapshot();
      });
    },
    [pullSnapshot, withBusy],
  );

  const onRefreshDevice = useCallback(
    (deviceID: string) => {
      void withBusy(async () => {
        const refreshed = (await GreetService.RefreshDevice(deviceID)) as ControllerSnapshot;
        setSnapshot(refreshed);
        setSettings(refreshed.settings);
        setStatus(`Device refreshed`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
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
    (deviceID: string, state: JSONMap) => {
      if (typeof state.on === "boolean") {
        deviceAutoApplyBlockedForPowerOffRef.current = !state.on;
      }
      void withBusy(async () => {
        await GreetService.SetDeviceState(deviceID, state);
        await pullSnapshot();
        setStatus(`Device updated`);
        if (route.kind === "device" && route.id === deviceID) {
          await loadDeviceDetail(deviceID);
        }
      });
    },
    [loadDeviceDetail, pullSnapshot, route, withBusy],
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
    const t = window.setTimeout(() => {
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
      // Omit `on` so we do not force strips on; bri/seg only.
      onSetDeviceState(deviceID, {
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
      });
    }, 200);
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
      onSetGlobalState(rgbState(r, g, b, presetBri, true), "All devices color");
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
    busy,
    currentVersion,
    updateInfo,
    updateProgress,
    updateBusy,
    updateAction,
    startupUpdateModalOpen,
    updateDiagnostics,
    route,
    setRoute,
    deviceDetail,
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
    onCheckForUpdates,
    onDownloadAndInstallUpdate,
    onPostponeUpdate,
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
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
  WARM_WHITE_RGB,
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
  WiFiNetwork,
} from "../types/controller";

export function useControllerApp() {
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
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

  const detailDeviceIdRef = useRef<string>("");
  const deviceStateAutoApplySkipRef = useRef(false);
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
    if (!deviceDetail?.state) {
      return;
    }
    const st = deviceDetail.state as JSONMap;
    const seg = segmentAt(st, selectedSegIdx);
    if (!seg) {
      return;
    }
    deviceStateAutoApplySkipRef.current = true;
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

  const onScanNetworks = useCallback(() => {
    void withBusy(async () => {
      const discovered = (await GreetService.ScanNetworks()) as WiFiNetwork[];
      setNetworks(discovered);
      setStatus(`Found ${discovered.length} upstream Wi-Fi networks`);
    });
  }, [withBusy]);

  const onApplyNetwork = useCallback(() => {
    void withBusy(async () => {
      const result = (await GreetService.ApplyNetworkSettings()) as NetworkApplyResult;
      setApplyResult(result);
      setStatus(result.dryRun ? "Network apply simulated (dry run)" : "Network settings applied");
    });
  }, [withBusy]);

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
    if (deviceStateAutoApplySkipRef.current) {
      deviceStateAutoApplySkipRef.current = false;
      return;
    }
    const deviceID = selectedDevice.id;
    const t = window.setTimeout(() => {
      onSetDeviceState(deviceID, {
        on: true,
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
    deviceDetail,
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
    networks,
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
    onScanNetworks,
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
  };
}
import { create } from "zustand";
import { WARM_WHITE_RGB } from "../lib/wled";
import type {
  ControllerSettings,
  ControllerSnapshot,
  DMXState,
  DetailRoute,
  NetworkApplyResult,
  USBSerialDevice,
  WLEDDevice,
  WLEDDeviceDetail,
} from "../types/controller";

export type ControllerStoreState = {
  snapshot: ControllerSnapshot | null;
  settings: ControllerSettings | null;
  applyResult: NetworkApplyResult | null;
  status: string;
  error: string;
  statePayloadText: string;
  configPatchText: string;
  presetBri: number;
  presetRgb: [number, number, number];
  generalFx: number;
  generalPal: number;
  generalSx: number;
  generalIx: number;
  busy: boolean;
  discovering: boolean;
  route: DetailRoute;
  deviceDetail: WLEDDeviceDetail | null;
  deviceDetailInitializing: boolean;
  deviceDetailReloading: boolean;
  deviceDetailFetchAttempt: number;
  deviceFormFx: number;
  deviceFormPal: number;
  deviceFormSx: number;
  deviceFormIx: number;
  deviceFormRgb: [number, number, number];
  deviceFormBri: number;
  deviceFormTransition: number;
  selectedSegIdx: number;
  ignoredDevices: WLEDDevice[];
  deviceNameDraft: string;
  editingDeviceName: boolean;
  currentVersion: string;
  dmxState: DMXState;
  usbSerialDevices: USBSerialDevice[];
};

export type ControllerStoreActions = {
  setSnapshot: (
    next: ControllerSnapshot | null | ((previous: ControllerSnapshot | null) => ControllerSnapshot | null),
  ) => void;
  setSettings: (
    next: ControllerSettings | null | ((previous: ControllerSettings | null) => ControllerSettings | null),
  ) => void;
  setApplyResult: (
    next: NetworkApplyResult | null | ((previous: NetworkApplyResult | null) => NetworkApplyResult | null),
  ) => void;
  setStatus: (next: string | ((previous: string) => string)) => void;
  setError: (next: string | ((previous: string) => string)) => void;
  setStatePayloadText: (next: string | ((previous: string) => string)) => void;
  setConfigPatchText: (next: string | ((previous: string) => string)) => void;
  setPresetBri: (next: number | ((previous: number) => number)) => void;
  setPresetRgb: (
    next: [number, number, number] | ((previous: [number, number, number]) => [number, number, number]),
  ) => void;
  setGeneralFx: (next: number | ((previous: number) => number)) => void;
  setGeneralPal: (next: number | ((previous: number) => number)) => void;
  setGeneralSx: (next: number | ((previous: number) => number)) => void;
  setGeneralIx: (next: number | ((previous: number) => number)) => void;
  setBusy: (next: boolean | ((previous: boolean) => boolean)) => void;
  setDiscovering: (next: boolean | ((previous: boolean) => boolean)) => void;
  setRoute: (next: DetailRoute | ((previous: DetailRoute) => DetailRoute)) => void;
  setDeviceDetail: (
    next:
      | WLEDDeviceDetail
      | null
      | ((previous: WLEDDeviceDetail | null) => WLEDDeviceDetail | null),
  ) => void;
  setDeviceDetailInitializing: (next: boolean | ((previous: boolean) => boolean)) => void;
  setDeviceDetailReloading: (next: boolean | ((previous: boolean) => boolean)) => void;
  setDeviceDetailFetchAttempt: (next: number | ((previous: number) => number)) => void;
  setDeviceFormFx: (next: number | ((previous: number) => number)) => void;
  setDeviceFormPal: (next: number | ((previous: number) => number)) => void;
  setDeviceFormSx: (next: number | ((previous: number) => number)) => void;
  setDeviceFormIx: (next: number | ((previous: number) => number)) => void;
  setDeviceFormRgb: (
    next: [number, number, number] | ((previous: [number, number, number]) => [number, number, number]),
  ) => void;
  setDeviceFormBri: (next: number | ((previous: number) => number)) => void;
  setDeviceFormTransition: (next: number | ((previous: number) => number)) => void;
  setSelectedSegIdx: (next: number | ((previous: number) => number)) => void;
  setIgnoredDevices: (next: WLEDDevice[] | ((previous: WLEDDevice[]) => WLEDDevice[])) => void;
  setDeviceNameDraft: (next: string | ((previous: string) => string)) => void;
  setEditingDeviceName: (next: boolean | ((previous: boolean) => boolean)) => void;
  setCurrentVersion: (next: string | ((previous: string) => string)) => void;
  setDMXState: (next: DMXState | ((previous: DMXState) => DMXState)) => void;
  setUSBSerialDevices: (
    next: USBSerialDevice[] | ((previous: USBSerialDevice[]) => USBSerialDevice[]),
  ) => void;
};

export type ControllerStore = ControllerStoreState & ControllerStoreActions;

const initialState: ControllerStoreState = {
  snapshot: null,
  settings: null,
  applyResult: null,
  status: "Loading...",
  error: "",
  statePayloadText: '{"on":true,"bri":180}',
  configPatchText: "{}",
  presetBri: 200,
  presetRgb: [...WARM_WHITE_RGB],
  generalFx: 0,
  generalPal: 0,
  generalSx: 128,
  generalIx: 128,
  busy: false,
  discovering: false,
  route: { kind: "presets" },
  deviceDetail: null,
  deviceDetailInitializing: false,
  deviceDetailReloading: false,
  deviceDetailFetchAttempt: 0,
  deviceFormFx: 0,
  deviceFormPal: 0,
  deviceFormSx: 128,
  deviceFormIx: 128,
  deviceFormRgb: [255, 0, 0],
  deviceFormBri: 180,
  deviceFormTransition: 7,
  selectedSegIdx: 0,
  ignoredDevices: [],
  deviceNameDraft: "",
  editingDeviceName: false,
  currentVersion: "unknown",
  dmxState: {
    fixtures: [],
    selectedUSBDeviceId: "",
  },
  usbSerialDevices: [],
};

function apply<T>(previous: T, next: T | ((previous: T) => T)): T {
  return typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
}

export const useControllerStore = create<ControllerStore>((set) => ({
  ...initialState,

  setSnapshot: (next) => set((s) => ({ snapshot: apply(s.snapshot, next) })),
  setSettings: (next) => set((s) => ({ settings: apply(s.settings, next) })),
  setApplyResult: (next) => set((s) => ({ applyResult: apply(s.applyResult, next) })),
  setStatus: (next) => set((s) => ({ status: apply(s.status, next) })),
  setError: (next) => set((s) => ({ error: apply(s.error, next) })),
  setStatePayloadText: (next) => set((s) => ({ statePayloadText: apply(s.statePayloadText, next) })),
  setConfigPatchText: (next) => set((s) => ({ configPatchText: apply(s.configPatchText, next) })),
  setPresetBri: (next) => set((s) => ({ presetBri: apply(s.presetBri, next) })),
  setPresetRgb: (next) => set((s) => ({ presetRgb: apply(s.presetRgb, next) })),
  setGeneralFx: (next) => set((s) => ({ generalFx: apply(s.generalFx, next) })),
  setGeneralPal: (next) => set((s) => ({ generalPal: apply(s.generalPal, next) })),
  setGeneralSx: (next) => set((s) => ({ generalSx: apply(s.generalSx, next) })),
  setGeneralIx: (next) => set((s) => ({ generalIx: apply(s.generalIx, next) })),
  setBusy: (next) => set((s) => ({ busy: apply(s.busy, next) })),
  setDiscovering: (next) => set((s) => ({ discovering: apply(s.discovering, next) })),
  setRoute: (next) => set((s) => ({ route: apply(s.route, next) })),
  setDeviceDetail: (next) => set((s) => ({ deviceDetail: apply(s.deviceDetail, next) })),
  setDeviceDetailInitializing: (next) =>
    set((s) => ({ deviceDetailInitializing: apply(s.deviceDetailInitializing, next) })),
  setDeviceDetailReloading: (next) =>
    set((s) => ({ deviceDetailReloading: apply(s.deviceDetailReloading, next) })),
  setDeviceDetailFetchAttempt: (next) =>
    set((s) => ({ deviceDetailFetchAttempt: apply(s.deviceDetailFetchAttempt, next) })),
  setDeviceFormFx: (next) => set((s) => ({ deviceFormFx: apply(s.deviceFormFx, next) })),
  setDeviceFormPal: (next) => set((s) => ({ deviceFormPal: apply(s.deviceFormPal, next) })),
  setDeviceFormSx: (next) => set((s) => ({ deviceFormSx: apply(s.deviceFormSx, next) })),
  setDeviceFormIx: (next) => set((s) => ({ deviceFormIx: apply(s.deviceFormIx, next) })),
  setDeviceFormRgb: (next) => set((s) => ({ deviceFormRgb: apply(s.deviceFormRgb, next) })),
  setDeviceFormBri: (next) => set((s) => ({ deviceFormBri: apply(s.deviceFormBri, next) })),
  setDeviceFormTransition: (next) =>
    set((s) => ({ deviceFormTransition: apply(s.deviceFormTransition, next) })),
  setSelectedSegIdx: (next) => set((s) => ({ selectedSegIdx: apply(s.selectedSegIdx, next) })),
  setIgnoredDevices: (next) => set((s) => ({ ignoredDevices: apply(s.ignoredDevices, next) })),
  setDeviceNameDraft: (next) => set((s) => ({ deviceNameDraft: apply(s.deviceNameDraft, next) })),
  setEditingDeviceName: (next) => set((s) => ({ editingDeviceName: apply(s.editingDeviceName, next) })),
  setCurrentVersion: (next) => set((s) => ({ currentVersion: apply(s.currentVersion, next) })),
  setDMXState: (next) => set((s) => ({ dmxState: apply(s.dmxState, next) })),
  setUSBSerialDevices: (next) => set((s) => ({ usbSerialDevices: apply(s.usbSerialDevices, next) })),
}));

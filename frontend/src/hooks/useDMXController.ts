import {useCallback, useRef, useState} from "react";
import i18n from "../i18n";
import * as GoldbusLightService from "../../bindings/goldbus/internal/service/goldbuslightservice";
import {DMXLiveStatus, DMXOutputUpdate} from "../../bindings/goldbus/internal/dmx/models";
import type {
    ControllerSettings,
    DMXFixture,
    DMXState,
    UpsertDMXFixtureInput,
    USBSerialDevice,
} from "../types/controller";

export interface UseDMXControllerOptions {
    dmxState: DMXState;
    usbSerialDevices: USBSerialDevice[];
    settings: ControllerSettings | null;
    setDMXState: (state: DMXState | ((prev: DMXState) => DMXState)) => void;
    setUSBSerialDevices: (devices: USBSerialDevice[]) => void;
    setStatus: (message: string) => void;
    setError: (error: string) => void;
    setBusy: (busy: boolean) => void;
}

export function useDMXController(options: UseDMXControllerOptions) {
    const {
        dmxState,
        usbSerialDevices,
        settings,
        setDMXState,
        setUSBSerialDevices,
        setStatus,
        setError,
        setBusy,
    } = options;

    const dmxLivePendingRef = useRef<Map<number, number>>(new Map());
    const dmxLiveFlushTimerRef = useRef<number | undefined>(undefined);
    const [dmxLiveStatus, setDmxLiveStatus] = useState<DMXLiveStatus | null>(null);

    const dmxEnabled = settings?.dmx.enabled ?? true;

    const pullDMXState = useCallback(async () => {
        const next = (await GoldbusLightService.GetDMXState()) as DMXState;
        setDMXState(next);
    }, [setDMXState]);

    const pullUSBSerialDevices = useCallback(async () => {
        const devices = (await GoldbusLightService.ListUSBSerialDevices()) as USBSerialDevice[];
        setUSBSerialDevices(devices);
    }, [setUSBSerialDevices]);

    const ensureDMXEnabled = useCallback((): boolean => {
        if ((settings?.dmx.enabled ?? true) === false) {
            setError(i18n.t("status:dmxDisabled"));
            return false;
        }
        return true;
    }, [settings?.dmx.enabled, setError]);

    const onCreateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            try {
                const created = (await GoldbusLightService.CreateDMXFixture(input as never)) as DMXFixture;
                await pullDMXState();
                setStatus(i18n.t("status:dmxFixtureCreated"));
                return created;
            } catch (err) {
                setError(String(err));
                return null;
            }
        },
        [ensureDMXEnabled, pullDMXState, setError, setStatus],
    );

    const onUpdateDMXFixture = useCallback(
        async (input: UpsertDMXFixtureInput): Promise<DMXFixture | null> => {
            if (!ensureDMXEnabled()) {
                return null;
            }
            try {
                const updated = (await GoldbusLightService.UpdateDMXFixture(input as never)) as DMXFixture;
                await pullDMXState();
                setStatus(i18n.t("status:dmxFixtureUpdated"));
                return updated;
            } catch (err) {
                setError(String(err));
                return null;
            }
        },
        [ensureDMXEnabled, pullDMXState, setError, setStatus],
    );

    const onDeleteDMXFixture = useCallback(
        async (fixtureID: string): Promise<boolean> => {
            if (!ensureDMXEnabled()) {
                return false;
            }
            try {
                await GoldbusLightService.DeleteDMXFixture(fixtureID);
                await pullDMXState();
                setStatus(i18n.t("status:dmxFixtureDeleted"));
                return true;
            } catch (err) {
                setError(String(err));
                return false;
            }
        },
        [ensureDMXEnabled, pullDMXState, setError, setStatus],
    );

    const refreshUSBSerialDevices = useCallback(async () => {
        if (!ensureDMXEnabled()) {
            return;
        }
        try {
            await pullUSBSerialDevices();
            setStatus(i18n.t("status:usbSerialRefreshed"));
        } catch (err) {
            setError(String(err));
        }
    }, [ensureDMXEnabled, pullUSBSerialDevices, setError, setStatus]);

    const onSelectUSBSerialDevice = useCallback(async (deviceID: string) => {
        if (!ensureDMXEnabled()) {
            return;
        }
        try {
            const next = (await GoldbusLightService.SetSelectedUSBSerialDevice(deviceID)) as DMXState;
            setDMXState(next);
            setStatus(deviceID ? i18n.t("status:usbDmxSelected") : i18n.t("status:usbDmxCleared"));
        } catch (err) {
            setError(String(err));
        }
    }, [ensureDMXEnabled, setDMXState, setError, setStatus]);

    const clampDmxByte = useCallback((v: number) => {
        return Math.max(0, Math.min(255, Math.round(v)));
    }, []);

    const pullDMXLiveStatus = useCallback(async () => {
        try {
            const st = (await GoldbusLightService.GetDMXLiveStatus()) as DMXLiveStatus;
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
            await GoldbusLightService.ApplyDMXLivePatch(updates);
            await pullDMXLiveStatus();
        } catch (err) {
            const errMsg = String(err);
            if (!errMsg.includes("not running")) {
                setError(errMsg);
            }
            await pullDMXLiveStatus();
        }
    }, [pullDMXLiveStatus, setError]);

    const queueDmxLivePatch = useCallback(
        (updates: Array<{ address: number; value: number }>) => {
            for (const e of updates) {
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
            }, 50);
        },
        [clampDmxByte, flushDmxLivePatch],
    );

    const startDMXLiveOutput = useCallback(
        async (fixtureID: string) => {
            if (!ensureDMXEnabled()) {
                return;
            }
            setBusy(true);
            try {
                await GoldbusLightService.StartDMXLive(fixtureID);
                setBusy(false);
                setStatus(i18n.t("status:dmxLiveStarted"));
                await pullDMXLiveStatus();
            } catch (err) {
                setBusy(false);
                setError(String(err));
                await pullDMXLiveStatus();
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
            await GoldbusLightService.StopDMXLive();
        } catch (err) {
            setError(String(err));
        }
        await pullDMXLiveStatus();
    }, [pullDMXLiveStatus, setError]);

    return {
        dmxEnabled,
        dmxState,
        dmxLiveStatus,
        usbSerialDevices,
        pullDMXState,
        pullUSBSerialDevices,
        onCreateDMXFixture,
        onUpdateDMXFixture,
        onDeleteDMXFixture,
        refreshUSBSerialDevices,
        onSelectUSBSerialDevice,
        pullDMXLiveStatus,
        queueDmxLivePatch,
        startDMXLiveOutput,
        stopDMXLiveOutput,
    };
}

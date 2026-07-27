import {useCallback, useEffect, useRef} from "react";
import * as GoldbusLightService from "../../bindings/goldbus/internal/service/goldbuslightservice";
import type {ControllerSnapshot, WLEDDeviceDetail} from "../types/controller";

const DEVICE_DETAIL_MAX_TRIES = 5;
const DEVICE_DETAIL_TRY_MS = 10_000;
const DEVICE_DETAIL_RETRY_DELAY_MS = 400;

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

export interface UseDeviceDetailOptions {
    deviceDetail: WLEDDeviceDetail | null;
    deviceDetailInitializing: boolean;
    deviceDetailReloading: boolean;
    deviceDetailFetchAttempt: number;
    setSnapshot: (snapshot: ControllerSnapshot | null | ((prev: ControllerSnapshot | null) => ControllerSnapshot | null)) => void;
    setDeviceDetail: (detail: WLEDDeviceDetail | null) => void;
    setDeviceDetailInitializing: (initializing: boolean) => void;
    setDeviceDetailReloading: (reloading: boolean) => void;
    setDeviceDetailFetchAttempt: (attempt: number) => void;
    setError: (error: string) => void;
}

export function useDeviceDetail(options: UseDeviceDetailOptions) {
    const {
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
    } = options;

    const detailDeviceIdRef = useRef<string>("");
    const deviceDetailRef = useRef<WLEDDeviceDetail | null>(null);

    useEffect(() => {
        deviceDetailRef.current = deviceDetail;
    }, [deviceDetail]);

    const fetchDeviceDetail = useCallback(
        async (deviceID: string, opts?: { background?: boolean }): Promise<WLEDDeviceDetail | null> => {
            const background = opts?.background ?? false;
            detailDeviceIdRef.current = deviceID;
            if (!background) {
                setDeviceDetailInitializing(true);
                setDeviceDetail(null);
            }
            setDeviceDetailReloading(true);
            setDeviceDetailFetchAttempt(1);

            for (let attempt = 1; attempt <= DEVICE_DETAIL_MAX_TRIES; attempt++) {
                setDeviceDetailFetchAttempt(attempt);
                if (detailDeviceIdRef.current !== deviceID) {
                    setDeviceDetailReloading(false);
                    setDeviceDetailInitializing(false);
                    return null;
                }

                try {
                    const call = GoldbusLightService.GetDeviceDetail(deviceID);
                    const detail = (await awaitCancellableWithTimeout(
                        call as CancellableThenable<WLEDDeviceDetail>,
                        DEVICE_DETAIL_TRY_MS,
                    )) as WLEDDeviceDetail;

                    if (detailDeviceIdRef.current !== deviceID) {
                        setDeviceDetailReloading(false);
                        setDeviceDetailInitializing(false);
                        return null;
                    }

                    setDeviceDetail(detail);
                    setDeviceDetailReloading(false);
                    setDeviceDetailInitializing(false);
                    return detail;
                } catch (err) {
                    if (attempt < DEVICE_DETAIL_MAX_TRIES) {
                        await sleep(DEVICE_DETAIL_RETRY_DELAY_MS);
                        continue;
                    }

                    if (detailDeviceIdRef.current !== deviceID) {
                        setDeviceDetailReloading(false);
                        setDeviceDetailInitializing(false);
                        return null;
                    }

                    setSnapshot((prev) => markDeviceOfflineInSnapshot(prev, deviceID));
                    setDeviceDetailInitializing(false);
                    setDeviceDetailReloading(false);
                    const msg = `Failed to fetch device detail after ${DEVICE_DETAIL_MAX_TRIES} attempts: ${err}`;
                    setError(msg);
                    return null;
                }
            }
            return null;
        },
        [
            setDeviceDetail,
            setDeviceDetailFetchAttempt,
            setDeviceDetailInitializing,
            setDeviceDetailReloading,
            setError,
            setSnapshot,
        ],
    );

    const reloadDeviceDetail = useCallback(async () => {
        const deviceID = detailDeviceIdRef.current;
        if (!deviceID) {
            return;
        }
        await fetchDeviceDetail(deviceID, {background: true});
    }, [fetchDeviceDetail]);

    return {
        deviceDetail,
        deviceDetailInitializing,
        deviceDetailReloading,
        deviceDetailFetchAttempt,
        fetchDeviceDetail,
        reloadDeviceDetail,
        DEVICE_DETAIL_MAX_TRIES,
    };
}

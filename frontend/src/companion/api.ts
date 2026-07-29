import type {
    DMXFixture,
    DMXFixtureCueSequence,
    DMXState,
    JSONMap,
    WLEDDevice,
} from "@/types/controller.ts";

export type CompanionLiveStatus = {
    connected: boolean;
    error?: string;
    devicePath?: string;
    deviceName?: string;
    fixtureId?: string;
};

export type CompanionLiveUpdate = {
    universeId?: string;
    address: number;
    value: number;
};

export type CompanionGeneralTab = {
    on: boolean;
    bri: number;
    rgb: [number, number, number];
    fx: number;
    pal: number;
    sx: number;
    ix: number;
};

export type CompanionApiState = {
    companion: {
        enabled: boolean;
        listening: boolean;
        port: number;
        urls: string[];
    };
    dmxEnabled: boolean;
    wledEnabled: boolean;
    partyRunning: boolean;
    liveStatus: CompanionLiveStatus;
    dmx: DMXState;
    devices: WLEDDevice[];
    generalTabState: CompanionGeneralTab;
};

async function parseJSON<T>(res: Response): Promise<T> {
    const text = await res.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }
    if (!res.ok) {
        const err =
            body && typeof body === "object" && body !== null && "error" in body
                ? String((body as {error: unknown}).error)
                : text || res.statusText;
        throw new Error(err || `HTTP ${res.status}`);
    }
    return body as T;
}

export async function fetchCompanionState(): Promise<CompanionApiState> {
    const res = await fetch("/api/state", {cache: "no-store"});
    return parseJSON<CompanionApiState>(res);
}

export async function applyLivePatch(updates: CompanionLiveUpdate[]): Promise<void> {
    const res = await fetch("/api/dmx/live-patch", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({updates}),
    });
    await parseJSON(res);
}

export async function saveFixtureCueSequence(
    fixtureId: string,
    cueSequence: DMXFixtureCueSequence,
): Promise<DMXFixture> {
    const res = await fetch(`/api/fixtures/${encodeURIComponent(fixtureId)}/cues`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({cueSequence}),
    });
    return parseJSON<DMXFixture>(res);
}

export async function setWledDeviceState(deviceId: string, state: JSONMap): Promise<void> {
    const res = await fetch(`/api/wled/devices/${encodeURIComponent(deviceId)}/state`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(state),
    });
    await parseJSON(res);
}

export async function applyWledPreset(deviceId: string, presetId: string): Promise<void> {
    const res = await fetch(
        `/api/wled/devices/${encodeURIComponent(deviceId)}/presets/${encodeURIComponent(presetId)}/apply`,
        {method: "POST"},
    );
    await parseJSON(res);
}

export async function setWledGlobalState(state: JSONMap): Promise<void> {
    const res = await fetch("/api/wled/global", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(state),
    });
    await parseJSON(res);
}

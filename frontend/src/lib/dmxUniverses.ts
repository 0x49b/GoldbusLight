import type {ControllerSettings, DMXFixture, DMXState, DMXUniverse, DMXUniverseInterfaceSettings} from "@/types/controller";
import {DEFAULT_DMX_UNIVERSE_ID, MAX_DMX_UNIVERSES} from "@/types/controller";

export function normalizeUniverses(universes: DMXUniverse[] | undefined): DMXUniverse[] {
    if (!universes?.length) {
        return [{id: DEFAULT_DMX_UNIVERSE_ID, name: "Universe 1"}];
    }
    return universes.slice(0, MAX_DMX_UNIVERSES);
}

export function resolveUniverseId(universeId: string | undefined, universes: DMXUniverse[]): string {
    const trimmed = (universeId ?? "").trim();
    if (trimmed && universes.some((u) => u.id === trimmed)) {
        return trimmed;
    }
    return universes[0]?.id ?? DEFAULT_DMX_UNIVERSE_ID;
}

export function fixturesForUniverse(fixtures: DMXFixture[], universeId: string, universes: DMXUniverse[]): DMXFixture[] {
    const resolved = resolveUniverseId(universeId, universes);
    return fixtures.filter((fx) => resolveUniverseId(fx.universeId, universes) === resolved);
}

export function countFixturesOnUniverse(fixtures: DMXFixture[], universeId: string, universes: DMXUniverse[]): number {
    return fixturesForUniverse(fixtures, universeId, universes).length;
}

export function universeInterfaceSettings(
    settings: ControllerSettings | null,
    universeId: string,
    dmxState: DMXState,
): DMXUniverseInterfaceSettings {
    const fromSettings = settings?.dmx.universeInterfaces?.[universeId];
    if (fromSettings) {
        return fromSettings;
    }
    const legacyUSB = universeId === DEFAULT_DMX_UNIVERSE_ID ? (dmxState.selectedUSBDeviceId ?? "") : "";
    const legacyArtNet = universeId === DEFAULT_DMX_UNIVERSE_ID && settings?.dmx.artNet
        ? settings.dmx.artNet
        : {
            enabled: false,
            targetHost: "255.255.255.255",
            port: 6454,
            net: 0,
            subnet: 0,
            universe: 0,
            refreshHz: 44,
        };
    return {
        selectedUSBDeviceId: legacyUSB,
        artNet: legacyArtNet,
    };
}

export function canDeleteUniverse(
    universes: DMXUniverse[],
    universeId: string,
    fixtures: DMXFixture[],
    liveConnected: boolean,
): boolean {
    if (liveConnected || universes.length <= 1) {
        return false;
    }
    return countFixturesOnUniverse(fixtures, universeId, universes) === 0;
}

export function canAddUniverse(universes: DMXUniverse[]): boolean {
    return universes.length < MAX_DMX_UNIVERSES;
}

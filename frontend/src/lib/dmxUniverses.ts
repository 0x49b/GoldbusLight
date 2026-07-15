import type {ControllerSettings, DMXFixture, DMXState, DMXUniverse, DMXUniverseInterfaceSettings} from "@/types/controller";
import {DEFAULT_DMX_UNIVERSE_ID} from "@/types/controller";

/** Always a single fixed universe after multi-universe collapse. */
export function normalizeUniverses(_universes?: DMXUniverse[]): DMXUniverse[] {
    return [{id: DEFAULT_DMX_UNIVERSE_ID, name: "Universe 1"}];
}

export function resolveUniverseId(_universeId?: string, _universes?: DMXUniverse[]): string {
    return DEFAULT_DMX_UNIVERSE_ID;
}

export function fixturesForUniverse(fixtures: DMXFixture[], _universeId?: string, _universes?: DMXUniverse[]): DMXFixture[] {
    return fixtures;
}

export function countFixturesOnUniverse(fixtures: DMXFixture[], _universeId?: string, _universes?: DMXUniverse[]): number {
    return fixtures.length;
}

export function universeInterfaceSettings(
    settings: ControllerSettings | null,
    _universeId: string,
    dmxState: DMXState,
): DMXUniverseInterfaceSettings {
    const fromSettings = settings?.dmx.universeInterfaces?.[DEFAULT_DMX_UNIVERSE_ID];
    if (fromSettings) {
        return fromSettings;
    }
    return {
        selectedUSBDeviceId: dmxState.selectedUSBDeviceId ?? "",
        artNet: settings?.dmx.artNet ?? {
            enabled: false,
            targetHost: "255.255.255.255",
            port: 6454,
            net: 0,
            subnet: 0,
            universe: 0,
            refreshHz: 44,
        },
    };
}

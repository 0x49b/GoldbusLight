import type {DMXPartyConfig} from "@/types/controller.ts";

export function isFixtureInParty(fixtureId: string, config: DMXPartyConfig | undefined): boolean {
    const ids = config?.fixtureIds ?? [];
    if (ids.length === 0) {
        return false;
    }
    return ids.includes(fixtureId);
}

export function isWledInParty(deviceId: string, config: DMXPartyConfig | undefined): boolean {
    const ids = config?.wledDeviceIds ?? [];
    if (ids.length === 0) {
        return false;
    }
    return ids.includes(deviceId);
}

export function hasPartyTargets(config: DMXPartyConfig | undefined): boolean {
    return (config?.fixtureIds?.length ?? 0) > 0 || (config?.wledDeviceIds?.length ?? 0) > 0;
}

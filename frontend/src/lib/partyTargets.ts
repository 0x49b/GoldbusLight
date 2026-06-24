import type {DMXFixture, DMXPartyConfig} from "@/types/controller.ts";
import {isFixtureSlave, resolveFixtureMaster} from "@/lib/dmxFixtureMasterSlave.ts";

export function isFixtureInParty(fixtureId: string, config: DMXPartyConfig | undefined): boolean {
    const ids = config?.fixtureIds ?? [];
    if (ids.length === 0) {
        return false;
    }
    return ids.includes(fixtureId);
}

/** True when the fixture or its master (for slaves) is included in party mode. */
export function isFixtureActiveInParty(
    fixture: DMXFixture,
    fixtures: DMXFixture[],
    config: DMXPartyConfig | undefined,
): boolean {
    if (isFixtureInParty(fixture.id, config)) {
        return true;
    }
    if (!isFixtureSlave(fixture)) {
        return false;
    }
    const master = resolveFixtureMaster(fixture, fixtures);
    return master != null && isFixtureInParty(master.id, config);
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

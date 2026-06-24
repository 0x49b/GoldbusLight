import type {DMXFixture} from "@/types/controller.ts";

export function isFixtureSlave(fixture: DMXFixture): boolean {
    return typeof fixture.masterFixtureId === "string" && fixture.masterFixtureId.trim() !== "";
}

export function slavesOf(fixtures: DMXFixture[], masterId: string): DMXFixture[] {
    const id = masterId.trim();
    if (!id) {
        return [];
    }
    return fixtures.filter((f) => (f.masterFixtureId ?? "").trim() === id);
}

export function fixtureHasSlaves(fixtures: DMXFixture[], fixtureId: string): boolean {
    return slavesOf(fixtures, fixtureId).length > 0;
}

/** Fixtures that can be chosen as master for the given fixture. */
export function masterEligibleFixtures(fixtures: DMXFixture[], currentId?: string): DMXFixture[] {
    const selfId = currentId?.trim() ?? "";
    return fixtures.filter((f) => {
        if (selfId && f.id === selfId) {
            return false;
        }
        if (isFixtureSlave(f)) {
            return false;
        }
        return true;
    });
}

export type SidebarFixtureRow = {
    fixture: DMXFixture;
    depth: number;
};

/** Order fixtures for sidebar display: masters/standalone first, slaves indented below their master. */
export function orderFixturesForSidebar(fixtures: DMXFixture[]): SidebarFixtureRow[] {
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    const slavesByMaster = new Map<string, DMXFixture[]>();
    const roots: DMXFixture[] = [];

    for (const fx of fixtures) {
        const masterId = (fx.masterFixtureId ?? "").trim();
        if (masterId && byId.has(masterId) && !isFixtureSlave(byId.get(masterId)!)) {
            const list = slavesByMaster.get(masterId) ?? [];
            list.push(fx);
            slavesByMaster.set(masterId, list);
        } else {
            roots.push(fx);
        }
    }

    const sortByAddress = (a: DMXFixture, b: DMXFixture) =>
        a.dmxAddress - b.dmxAddress || a.name.localeCompare(b.name);

    roots.sort(sortByAddress);
    const out: SidebarFixtureRow[] = [];
    for (const root of roots) {
        out.push({fixture: root, depth: 0});
        const slaves = (slavesByMaster.get(root.id) ?? []).slice().sort(sortByAddress);
        for (const slave of slaves) {
            out.push({fixture: slave, depth: 1});
        }
    }
    return out;
}

/** Fixtures selectable in party mode (slaves are driven via their master). */
export function partySelectableFixtures(fixtures: DMXFixture[]): DMXFixture[] {
    return fixtures.filter((f) => !isFixtureSlave(f));
}

export function resolveFixtureMaster(fixture: DMXFixture, fixtures: DMXFixture[]): DMXFixture | undefined {
    const masterId = (fixture.masterFixtureId ?? "").trim();
    if (!masterId) {
        return undefined;
    }
    return fixtures.find((f) => f.id === masterId);
}

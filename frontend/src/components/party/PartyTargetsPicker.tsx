import {useMemo} from "react";
import {Button} from "@/components/ui/button";
import type {DMXFixture, WLEDDevice} from "@/types/controller";
import {partySelectableFixtures} from "@/lib/dmxFixtureMasterSlave";

type PartyTargetsPickerProps = {
    wledDevices: WLEDDevice[];
    fixtures: DMXFixture[];
    selectedWledIds: string[];
    selectedFixtureIds: string[];
    disabled?: boolean;
    onChangeWledIds: (ids: string[]) => void;
    onChangeFixtureIds: (ids: string[]) => void;
};

export function PartyTargetsPicker({
    wledDevices,
    fixtures,
    selectedWledIds,
    selectedFixtureIds,
    disabled = false,
    onChangeWledIds,
    onChangeFixtureIds,
}: PartyTargetsPickerProps) {
    const partyFixtures = useMemo(() => partySelectableFixtures(fixtures), [fixtures]);
    const selectedWledSet = useMemo(() => new Set(selectedWledIds), [selectedWledIds]);
    const selectedFixtureSet = useMemo(() => new Set(selectedFixtureIds), [selectedFixtureIds]);

    const allWledSelected =
        wledDevices.length > 0 && wledDevices.every((device) => selectedWledSet.has(device.id));
    const allFixturesSelected =
        partyFixtures.length > 0 && partyFixtures.every((fixture) => selectedFixtureSet.has(fixture.id));

    const toggleWled = (deviceId: string) => {
        const next = new Set(selectedWledIds);
        if (next.has(deviceId)) {
            next.delete(deviceId);
        } else {
            next.add(deviceId);
        }
        onChangeWledIds(Array.from(next));
    };

    const toggleFixture = (fixtureId: string) => {
        const next = new Set(selectedFixtureIds);
        if (next.has(fixtureId)) {
            next.delete(fixtureId);
        } else {
            next.add(fixtureId);
        }
        onChangeFixtureIds(Array.from(next));
    };

    return (
        <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">WLED targets</span>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || wledDevices.length === 0}
                        onClick={() =>
                            onChangeWledIds(allWledSelected ? [] : wledDevices.map((device) => device.id))
                        }
                    >
                        {allWledSelected ? "Clear selection" : "Select all"}
                    </Button>
                </div>
                <div className="grid max-h-36 grid-cols-1 gap-1 overflow-auto pr-1">
                    {wledDevices.map((device) => (
                        <label
                            key={device.id}
                            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
                        >
                            <input
                                type="checkbox"
                                checked={selectedWledSet.has(device.id)}
                                disabled={disabled}
                                onChange={() => toggleWled(device.id)}
                            />
                            <span className="truncate">{device.name}</span>
                        </label>
                    ))}
                    {wledDevices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No online WLED devices available.</p>
                    ) : null}
                </div>
            </div>

            <div className="rounded-md border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">DMX targets</span>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || partyFixtures.length === 0}
                        onClick={() =>
                            onChangeFixtureIds(allFixturesSelected ? [] : partyFixtures.map((fixture) => fixture.id))
                        }
                    >
                        {allFixturesSelected ? "Clear selection" : "Select all"}
                    </Button>
                </div>
                <div className="grid max-h-36 grid-cols-1 gap-1 overflow-auto pr-1">
                    {partyFixtures.map((fixture) => (
                        <label
                            key={fixture.id}
                            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
                        >
                            <input
                                type="checkbox"
                                checked={selectedFixtureSet.has(fixture.id)}
                                disabled={disabled}
                                onChange={() => toggleFixture(fixture.id)}
                            />
                            <span className="truncate">
                                {[fixture.brand, fixture.name].filter(Boolean).join(" ") || fixture.id}
                            </span>
                        </label>
                    ))}
                    {partyFixtures.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No DMX fixtures available.</p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

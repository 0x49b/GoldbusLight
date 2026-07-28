import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {DMXFixture, DMXFixtureCue, DMXFixtureCueSequence} from "@/types/controller.ts";
import {
    buildDmxLivePatch,
    defaultDmxLiveControlState,
    dmxLiveControlStateFromCue,
    type DMXLiveControlState,
} from "@/lib/dmxLiveMap.ts";
import {liveWidgetHiddenSource, resolveLiveWidget} from "@/lib/dmxLiveWidget.ts";
import {LiveChannelControl} from "@/components/dmx/LiveChannelControl";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {applyLivePatch, saveFixtureCueSequence} from "./api";

type FixtureFocusViewProps = {
    fixture: DMXFixture;
    partyRunning: boolean;
    liveConnected: boolean;
    busy: boolean;
    setBusy: (v: boolean) => void;
    setError: (message: string | null) => void;
    onFixtureUpdated: (fixture: DMXFixture) => void;
    onRefresh: () => void;
};

function newCueId(): string {
    return `cue-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function FixtureFocusView({
    fixture,
    partyRunning,
    liveConnected,
    busy,
    setBusy,
    setError,
    onFixtureUpdated,
    onRefresh,
}: FixtureFocusViewProps) {
    const [liveState, setLiveState] = useState<DMXLiveControlState>(() => {
        const idleId = fixture.party?.cueSequence?.idleCueId;
        const idle = fixture.party?.cueSequence?.cues?.find((c) => c.id === idleId);
        return idle ? dmxLiveControlStateFromCue(fixture, idle.values) : defaultDmxLiveControlState(fixture);
    });
    const [activeCueId, setActiveCueId] = useState<string | null>(
        fixture.party?.cueSequence?.idleCueId ?? null,
    );
    const [cueName, setCueName] = useState("");
    const [tab, setTab] = useState<"live" | "cues">("live");
    const patchTimer = useRef<number | null>(null);
    const fixtureRef = useRef(fixture);
    fixtureRef.current = fixture;

    const controlsDisabled = busy || partyRunning || !liveConnected || !!fixture.masterFixtureId;

    const visibleChannels = useMemo(() => {
        return (fixture.channels ?? []).filter((ch) => {
            if (resolveLiveWidget(ch) === "hidden") {
                return false;
            }
            if (liveWidgetHiddenSource(ch)) {
                return false;
            }
            return true;
        });
    }, [fixture.channels]);

    const queuePatch = useCallback(
        (state: DMXLiveControlState) => {
            if (controlsDisabled) {
                return;
            }
            if (patchTimer.current != null) {
                window.clearTimeout(patchTimer.current);
            }
            patchTimer.current = window.setTimeout(() => {
                const updates = buildDmxLivePatch(fixtureRef.current, state).map((u) => ({
                    universeId: fixtureRef.current.universeId,
                    address: u.address,
                    value: u.value,
                }));
                void applyLivePatch(updates).catch((err: unknown) => setError(String(err)));
            }, 50);
        },
        [controlsDisabled, setError],
    );

    useEffect(() => {
        return () => {
            if (patchTimer.current != null) {
                window.clearTimeout(patchTimer.current);
            }
        };
    }, []);

    const onStateChange = useCallback(
        (next: DMXLiveControlState) => {
            setLiveState(next);
            queuePatch(next);
        },
        [queuePatch],
    );

    const captureValues = useCallback((): Record<string, number> => {
        const base = Math.max(1, Math.round(fixture.dmxAddress || 1));
        const values: Record<string, number> = {};
        for (const {address, value} of buildDmxLivePatch(fixture, liveState)) {
            values[String(address - base + 1)] = value;
        }
        return values;
    }, [fixture, liveState]);

    const sequence: DMXFixtureCueSequence = fixture.party?.cueSequence ?? {
        enabled: false,
        cues: [],
        loop: true,
    };

    const persistSequence = async (next: DMXFixtureCueSequence) => {
        setBusy(true);
        setError(null);
        try {
            const updated = await saveFixtureCueSequence(fixture.id, next);
            onFixtureUpdated(updated);
            onRefresh();
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const applyCue = (cue: DMXFixtureCue) => {
        const next = dmxLiveControlStateFromCue(fixture, cue.values);
        setLiveState(next);
        setActiveCueId(cue.id);
        queuePatch(next);
    };

    const saveAsCue = async () => {
        const label = cueName.trim() || `Cue ${(sequence.cues?.length ?? 0) + 1}`;
        const cue: DMXFixtureCue = {
            id: newCueId(),
            label,
            values: captureValues(),
        };
        const next: DMXFixtureCueSequence = {
            ...sequence,
            cues: [...(sequence.cues ?? []), cue],
        };
        const ok = await persistSequence(next);
        if (ok) {
            setActiveCueId(cue.id);
            setCueName("");
            setTab("cues");
        }
    };

    const updateActiveFromLive = async () => {
        if (!activeCueId) {
            return;
        }
        const next: DMXFixtureCueSequence = {
            ...sequence,
            cues: (sequence.cues ?? []).map((c) =>
                c.id === activeCueId ? {...c, values: captureValues()} : c,
            ),
        };
        await persistSequence(next);
    };

    const setIdleCue = async (cueId: string) => {
        const next: DMXFixtureCueSequence = {
            ...sequence,
            idleCueId: cueId || undefined,
        };
        await persistSequence(next);
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">{fixture.name || fixture.id}</h2>
                <p className="text-sm text-muted-foreground">
                    {fixture.type}
                    {fixture.brand ? ` · ${fixture.brand}` : ""}
                    {` · addr ${fixture.dmxAddress}`}
                </p>
            </div>

            {!liveConnected ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    DMX output is off on the kiosk. Turn on USB/Art-Net output to steer this fixture.
                </p>
            ) : null}

            <div className="flex gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={tab === "live" ? "default" : "outline"}
                    onClick={() => setTab("live")}
                >
                    Live
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={tab === "cues" ? "default" : "outline"}
                    onClick={() => setTab("cues")}
                >
                    Cues
                </Button>
            </div>

            {tab === "live" ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {visibleChannels.map((ch) => (
                            <div
                                key={`${fixture.id}-${ch.channel}`}
                                className="min-h-44 rounded-lg border bg-card/40 p-2"
                            >
                                <LiveChannelControl
                                    fixture={fixture}
                                    channel={ch}
                                    liveState={liveState}
                                    onStateChange={onStateChange}
                                    disabled={controlsDisabled}
                                    compact
                                />
                            </div>
                        ))}
                    </div>

                    <div className="sticky bottom-0 space-y-2 rounded-lg border bg-background/95 p-3 backdrop-blur">
                        <div className="flex gap-2">
                            <Input
                                value={cueName}
                                onChange={(e) => setCueName(e.target.value)}
                                placeholder="Cue name"
                                disabled={busy}
                            />
                            <Button type="button" disabled={busy || controlsDisabled} onClick={() => void saveAsCue()}>
                                Save cue
                            </Button>
                        </div>
                        {activeCueId ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                disabled={busy || controlsDisabled}
                                onClick={() => void updateActiveFromLive()}
                            >
                                Update active cue from live
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {(sequence.cues ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No cues yet. Adjust Live controls and tap Save cue.
                        </p>
                    ) : (
                        <ul className="divide-y rounded-lg border">
                            {(sequence.cues ?? []).map((cue) => {
                                const isActive = cue.id === activeCueId;
                                const isIdle = cue.id === sequence.idleCueId;
                                return (
                                    <li key={cue.id} className="space-y-2 px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">
                                                    {cue.label || cue.id}
                                                    {isActive ? " · active" : ""}
                                                    {isIdle ? " · idle" : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={controlsDisabled}
                                                onClick={() => applyCue(cue)}
                                            >
                                                Apply
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={busy}
                                                onClick={() => void setIdleCue(isIdle ? "" : cue.id)}
                                            >
                                                {isIdle ? "Clear idle" : "Set idle"}
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

import {useCallback, useEffect, useMemo, useState} from "react";
import type {DMXFixture, WLEDDevice} from "@/types/controller.ts";
import {fetchCompanionState, type CompanionApiState} from "./api";
import {HomeView} from "./HomeView";
import {FixtureFocusView} from "./FixtureFocusView";
import {WledFocusView} from "./WledFocusView";


type Route =
    | {kind: "home"}
    | {kind: "fixture"; id: string}
    | {kind: "wled"; id: string};

export function CompanionApp() {
    const [route, setRoute] = useState<Route>({kind: "home"});
    const [state, setState] = useState<CompanionApiState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const next = await fetchCompanionState();
            setState(next);
            setError(null);
        } catch (err) {
            setError(String(err));
        }
    }, []);

    useEffect(() => {
        void refresh();
        const id = window.setInterval(() => {
            void refresh();
        }, 1500);
        return () => window.clearInterval(id);
    }, [refresh]);

    const fixtures = useMemo(() => state?.dmx.fixtures ?? [], [state]);
    const devices = useMemo(() => state?.devices ?? [], [state]);

    const fixture: DMXFixture | null = useMemo(() => {
        if (route.kind !== "fixture") {
            return null;
        }
        return fixtures.find((f) => f.id === route.id) ?? null;
    }, [fixtures, route]);

    const device: WLEDDevice | null = useMemo(() => {
        if (route.kind !== "wled") {
            return null;
        }
        return devices.find((d) => d.id === route.id) ?? null;
    }, [devices, route]);

    return (
        <div className="min-h-dvh bg-background text-foreground">
            <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            Goldbus
                        </p>
                    </div>
                    {route.kind !== "home" ? (
                        <button
                            type="button"
                            className="rounded-md border px-3 py-1.5 text-sm"
                            onClick={() => setRoute({kind: "home"})}
                        >
                            Home
                        </button>
                    ) : null}
                </div>
            </header>

            <main className="mx-auto max-w-lg px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                {error ? (
                    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                        {error}
                    </div>
                ) : null}

                {state?.partyRunning ? (
                    <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                        Party mode is running on the kiosk. Live fixture edits are locked until Party is stopped.
                    </div>
                ) : null}

                {!state ? (
                    <p className="text-sm text-muted-foreground">Connecting…</p>
                ) : route.kind === "home" ? (
                    <HomeView
                        state={state}
                        onOpenFixture={(id) => setRoute({kind: "fixture", id})}
                        onOpenWled={(id) => setRoute({kind: "wled", id})}
                    />
                ) : route.kind === "fixture" && fixture ? (
                    <FixtureFocusView
                        fixture={fixture}
                        partyRunning={!!state.partyRunning}
                        liveConnected={!!state.liveStatus?.connected}
                        busy={busy}
                        setBusy={setBusy}
                        setError={setError}
                        onFixtureUpdated={(next) => {
                            setState((prev) => {
                                if (!prev) {
                                    return prev;
                                }
                                return {
                                    ...prev,
                                    dmx: {
                                        ...prev.dmx,
                                        fixtures: prev.dmx.fixtures.map((f) => (f.id === next.id ? next : f)),
                                    },
                                };
                            });
                        }}
                        onRefresh={() => void refresh()}
                    />
                ) : route.kind === "wled" && device ? (
                    <WledFocusView
                        device={device}
                        busy={busy}
                        setBusy={setBusy}
                        setError={setError}
                        onRefresh={() => void refresh()}
                    />
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Item not found.</p>
                        <button
                            type="button"
                            className="rounded-md border px-3 py-1.5 text-sm"
                            onClick={() => setRoute({kind: "home"})}
                        >
                            Back home
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}

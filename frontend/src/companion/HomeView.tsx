import type {CompanionApiState} from "./api";
import {DMXOutputIndicator} from "@/components/dmx/DMXOutputIndicator.tsx";

type HomeViewProps = {
    state: CompanionApiState;
    onOpenFixture: (id: string) => void;
    onOpenWled: (id: string) => void;
};

export function HomeView({state, onOpenFixture, onOpenWled}: HomeViewProps) {
    const fixtures = (state.dmx.fixtures ?? []).filter((f) => !f.masterFixtureId);
    const devices = state.devices ?? [];

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold">DMX fixtures</h2>
                    <p className="text-sm text-muted-foreground">
                        Focus moving heads and save cues while you walk the stage.
                    </p>
                </div>
                {!state.dmxEnabled ? (
                    <p className="text-sm text-muted-foreground">DMX is disabled on the kiosk.</p>
                ) : fixtures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No fixtures configured yet.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {fixtures.map((f) => (
                            <li key={f.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-muted/60"
                                    onClick={() => onOpenFixture(f.id)}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{f.name || f.id}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {f.type}
                                            {f.brand ? ` · ${f.brand}` : ""}
                                            {` · addr ${f.dmxAddress}`}
                                        </span>
                                    </span>
                                    <span className="text-muted-foreground">›</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold">WLED</h2>
                    <p className="text-sm text-muted-foreground">
                        Adjust fill and ambience strips before the show.
                    </p>
                </div>
                {!state.wledEnabled ? (
                    <p className="text-sm text-muted-foreground">WLED is disabled on the kiosk.</p>
                ) : devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No WLED devices configured yet.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {devices.map((d) => (
                            <li key={d.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-muted/60"
                                    onClick={() => onOpenWled(d.id)}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{d.name || d.address}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {d.address}
                                            {d.online ? " · online" : " · offline"}
                                        </span>
                                    </span>
                                    <span className="text-muted-foreground">›</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="text-xs text-muted-foreground">
                Output: {state.liveStatus?.connected ? "DMX ON" : "DMX OFF"}
                {state.liveStatus?.error ? ` · ${state.liveStatus.error}` : ""}
            </p>
            <DMXOutputIndicator connected={state.liveStatus?.connected}/>
        </div>
    );
}

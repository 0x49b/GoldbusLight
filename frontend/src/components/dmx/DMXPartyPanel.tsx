import {Button} from "@/components/ui/button";
import type {DMXFixture, DMXPartyConfig, DMXPartyState} from "../../types/controller";

type DMXPartyPanelProps = {
    fixtures: DMXFixture[];
    party: DMXPartyState;
    busy: boolean;
    liveConnected: boolean;
    audioInputDevices: MediaDeviceInfo[];
    audioCapturing: boolean;
    onUpdateConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    onStart: () => Promise<boolean>;
    onStop: () => Promise<void>;
    onStartAudioCapture: (deviceId?: string) => Promise<boolean>;
    onStopAudioCapture: () => void;
};

function normalizePercent(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(v)));
}

export function DMXPartyPanel({
    fixtures,
    party,
    busy,
    liveConnected,
    audioInputDevices,
    audioCapturing,
    onUpdateConfig,
    onStart,
    onStop,
    onStartAudioCapture,
    onStopAudioCapture,
}: DMXPartyPanelProps) {
    const config = party.config;
    const running = party.status.running;
    const mode = config.mode || "auto";
    const selectedFixtureIDs = new Set(config.fixtureIds ?? []);
    const allSelected = fixtures.length > 0 && fixtures.every((fixture) => selectedFixtureIDs.has(fixture.id));

    const setSlider = (field: "intensity" | "speed" | "colorVariation" | "audioSensitivity", raw: number) => {
        void onUpdateConfig({[field]: normalizePercent(raw)});
    };

    const toggleFixture = (fixtureId: string) => {
        const next = new Set(config.fixtureIds ?? []);
        if (next.has(fixtureId)) {
            next.delete(fixtureId);
        } else {
            next.add(fixtureId);
        }
        void onUpdateConfig({fixtureIds: Array.from(next)});
    };

    const toggleAllFixtures = () => {
        if (allSelected) {
            void onUpdateConfig({fixtureIds: []});
            return;
        }
        void onUpdateConfig({fixtureIds: fixtures.map((fixture) => fixture.id)});
    };

    const renderSlider = (
        field: "intensity" | "speed" | "colorVariation" | "audioSensitivity",
        label: string,
        value: number,
    ) => (
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-medium">{label}: {normalizePercent(value)}%</span>
            <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={normalizePercent(value)}
                disabled={busy}
                onChange={(event) => setSlider(field, Number(event.target.value))}
            />
        </label>
    );

    return (
        <section className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Party Mode</h3>
                    <p className="text-xs text-muted-foreground">
                        Procedural and audio-reactive fixture driving for non-programmed shows.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {running ? "Running" : "Stopped"}
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        variant={running ? "destructive" : "secondary"}
                        disabled={busy || !liveConnected || fixtures.length === 0}
                        onClick={() => {
                            if (running) {
                                void onStop();
                            } else {
                                void onStart();
                            }
                        }}
                    >
                        {running ? "Stop Party" : "Start Party"}
                    </Button>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
                <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
                    <span className="font-medium">Mode</span>
                    <select
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                        value={mode}
                        disabled={busy}
                        onChange={(event) => {
                            const nextMode = event.target.value === "audio" ? "audio" : "auto";
                            void onUpdateConfig({mode: nextMode});
                        }}
                    >
                        <option value="auto">Auto show</option>
                        <option value="audio">Audio reactive</option>
                    </select>
                </label>
                {renderSlider("intensity", "Intensity", config.intensity)}
                {renderSlider("speed", "Speed", config.speed)}
                {renderSlider("colorVariation", "Color variation", config.colorVariation)}
                {mode === "audio" && renderSlider("audioSensitivity", "Audio sensitivity", config.audioSensitivity)}
            </div>

            {mode === "audio" && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2">
                    <label className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                        <span className="font-medium">Input device</span>
                        <select
                            className="rounded-md border bg-background px-2 py-1 text-sm"
                            value={config.audioInputDeviceId || ""}
                            disabled={busy}
                            onChange={(event) => {
                                const nextDeviceID = event.target.value;
                                void onUpdateConfig({audioInputDeviceId: nextDeviceID});
                                if (audioCapturing) {
                                    void onStartAudioCapture(nextDeviceID || undefined);
                                }
                            }}
                        >
                            <option value="">Default input</option>
                            {audioInputDevices.map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Audio input ${device.deviceId.slice(0, 6)}`}
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button
                        type="button"
                        size="sm"
                        variant={audioCapturing ? "destructive" : "outline"}
                        disabled={busy}
                        onClick={() => {
                            if (audioCapturing) {
                                onStopAudioCapture();
                            } else {
                                void onStartAudioCapture(config.audioInputDeviceId || undefined);
                            }
                        }}
                    >
                        {audioCapturing ? "Stop capture" : "Start capture"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Level {(party.audio.level * 100).toFixed(0)}% · Beat {(party.audio.beat * 100).toFixed(0)}%
                    </span>
                </div>
            )}

            <div className="mt-3 rounded-md border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Fixture targets</span>
                    <Button type="button" size="sm" variant="ghost" disabled={busy || fixtures.length === 0} onClick={toggleAllFixtures}>
                        {allSelected ? "Clear selection" : "Select all"}
                    </Button>
                </div>
                <div className="grid max-h-24 grid-cols-2 gap-1 overflow-auto pr-1">
                    {fixtures.map((fixture) => {
                        const checked = selectedFixtureIDs.has(fixture.id);
                        return (
                            <label key={fixture.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={busy}
                                    onChange={() => toggleFixture(fixture.id)}
                                />
                                <span className="truncate">{fixture.name}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
            {!liveConnected && (
                <p className="mt-2 text-xs text-amber-600">
                    Start DMX live output first, then enable Party mode.
                </p>
            )}
            {party.status.error ? (
                <p className="mt-2 text-xs text-destructive">{party.status.error}</p>
            ) : null}
        </section>
    );
}

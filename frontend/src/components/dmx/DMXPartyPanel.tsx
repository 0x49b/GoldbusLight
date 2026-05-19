import {useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import type {
    DMXFixture,
    DMXPartyAudioInputDevice,
    DMXPartyAudioSourcePreset,
    DMXPartyConfig,
    DMXPartyState,
} from "@/types/controller.ts";
import {formatPartyTimestamp, listUSBMicDevices, pickLoopbackDevice, pickUSBMicDevice} from "../../lib/dmxPartyAudio";

type DMXPartyPanelProps = {
    fixtures: DMXFixture[];
    party: DMXPartyState;
    busy: boolean;
    liveConnected: boolean;
    audioInputDevices: DMXPartyAudioInputDevice[];
    onRefreshAudioDevices: () => Promise<void>;
    onUpdateConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    onStart: () => Promise<boolean>;
    onStop: () => Promise<void>;
};

function normalizePercent(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(v)));
}

function inferAudioSourcePreset(config: DMXPartyConfig, devices: DMXPartyAudioInputDevice[]): DMXPartyAudioSourcePreset {
    const deviceId = config.audioInputDeviceId || "";
    if (!deviceId) {
        return "mic";
    }
    const match = devices.find((device) => device.id === deviceId);
    if (match?.isLoopback) {
        return "loopback";
    }
    if (match?.isUSB) {
        return "usbMic";
    }
    return "custom";
}

export function DMXPartyPanel({
    fixtures,
    party,
    busy,
    liveConnected,
    audioInputDevices,
    onRefreshAudioDevices,
    onUpdateConfig,
    onStart,
    onStop,
}: DMXPartyPanelProps) {
    const config = party.config;
    const running = party.status.running;
    const mode = config.mode || "auto";
    const selectedFixtureIDs = new Set(config.fixtureIds ?? []);
    const allSelected = fixtures.length > 0 && fixtures.every((fixture) => selectedFixtureIDs.has(fixture.id));

    const [audioSourcePreset, setAudioSourcePreset] = useState<DMXPartyAudioSourcePreset>(() =>
        inferAudioSourcePreset(config, audioInputDevices),
    );

    useEffect(() => {
        setAudioSourcePreset(inferAudioSourcePreset(config, audioInputDevices));
    }, [config.audioInputDeviceId, audioInputDevices]);

    useEffect(() => {
        if (mode === "audio") {
            void onRefreshAudioDevices();
        }
    }, [mode, onRefreshAudioDevices]);

    const loopbackDevices = useMemo(
        () => audioInputDevices.filter((device) => device.isLoopback),
        [audioInputDevices],
    );
    const usbMicDevices = useMemo(
        () => listUSBMicDevices(audioInputDevices),
        [audioInputDevices],
    );

    const applyAudioPreset = async (preset: DMXPartyAudioSourcePreset) => {
        setAudioSourcePreset(preset);
        if (preset === "mic") {
            const builtin = audioInputDevices.find((device) => device.isBuiltin && device.isDefault)
                ?? audioInputDevices.find((device) => device.isBuiltin);
            await onUpdateConfig({audioInputDeviceId: builtin?.id ?? ""});
            return;
        }
        if (preset === "usbMic") {
            const usbMic = pickUSBMicDevice(audioInputDevices);
            await onUpdateConfig({audioInputDeviceId: usbMic?.id ?? ""});
            return;
        }
        if (preset === "loopback") {
            const loopback = pickLoopbackDevice(audioInputDevices);
            await onUpdateConfig({audioInputDeviceId: loopback?.id ?? ""});
        }
    };

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

            {running && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Last frame: {formatPartyTimestamp(party.status.lastFrameAt)}</span>
                    {mode === "audio" && (
                        <span>Last audio: {formatPartyTimestamp(party.status.lastAudioAt)}</span>
                    )}
                    {party.status.partyBlocksManualPatch && (
                        <span>Manual live patches blocked on party channels</span>
                    )}
                </div>
            )}

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
                <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium">Source preset</span>
                            <select
                                className="rounded-md border bg-background px-2 py-1 text-sm"
                                value={audioSourcePreset}
                                disabled={busy}
                                onChange={(event) => {
                                    const preset = event.target.value as DMXPartyAudioSourcePreset;
                                    void applyAudioPreset(preset);
                                }}
                            >
                                <option value="mic">Built-in microphone</option>
                                <option value="usbMic">USB microphone</option>
                                <option value="loopback">Loopback / line-in</option>
                                <option value="custom">Custom device</option>
                            </select>
                        </label>

                        {audioSourcePreset === "usbMic" && (
                            <label className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                                <span className="font-medium">USB microphone</span>
                                <select
                                    className="rounded-md border bg-background px-2 py-1 text-sm"
                                    value={config.audioInputDeviceId || ""}
                                    disabled={busy || usbMicDevices.length === 0}
                                    onChange={(event) => {
                                        void onUpdateConfig({audioInputDeviceId: event.target.value});
                                    }}
                                >
                                    {usbMicDevices.length === 0 ? (
                                        <option value="">No USB microphone found</option>
                                    ) : (
                                        usbMicDevices.map((device) => (
                                            <option key={device.id} value={device.id}>
                                                {device.name || `USB mic ${device.id.slice(0, 6)}`}
                                                {device.isDefault ? " (system default)" : ""}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </label>
                        )}

                        {audioSourcePreset === "custom" && (
                            <label className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                                <span className="font-medium">Input device</span>
                                <select
                                    className="rounded-md border bg-background px-2 py-1 text-sm"
                                    value={config.audioInputDeviceId || ""}
                                    disabled={busy}
                                    onChange={(event) => {
                                        void onUpdateConfig({audioInputDeviceId: event.target.value});
                                    }}
                                >
                                    <option value="">Default input</option>
                                    {audioInputDevices.map((device) => (
                                        <option key={device.id} value={device.id}>
                                            {device.name || `Audio input ${device.id.slice(0, 6)}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onRefreshAudioDevices()}
                        >
                            Refresh devices
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            Capture: {party.status.audioCapturing ? "active (native)" : running ? "starting…" : "starts with Party"}
                        </span>
                        <span>Level {(party.audio.level * 100).toFixed(0)}%</span>
                        <span>Bass {(party.audio.bass * 100).toFixed(0)}%</span>
                        <span>Mid {(party.audio.mid * 100).toFixed(0)}%</span>
                        <span>Treble {(party.audio.treble * 100).toFixed(0)}%</span>
                        <span>Beat {(party.audio.beat * 100).toFixed(0)}%</span>
                    </div>

                    {audioSourcePreset === "usbMic" && usbMicDevices.length === 0 && (
                        <p className="text-xs text-amber-600">
                            No USB microphone detected. Plug in your USB mic, then click Refresh devices.
                        </p>
                    )}
                    {audioSourcePreset === "loopback" && loopbackDevices.length === 0 && (
                        <p className="text-xs text-amber-600">
                            No loopback device found. Install a virtual audio cable (BlackHole on macOS, VB-Audio or
                            Stereo Mix on Windows) and refresh devices.
                        </p>
                    )}
                    {audioInputDevices.length === 0 && (
                        <p className="text-xs text-amber-600">No audio input devices were found.</p>
                    )}
                    {party.status.audioNoSignal && (
                        <p className="text-xs text-amber-600">
                            No signal detected. Check input volume, routing, or loopback setup.
                        </p>
                    )}
                    {party.status.audioCaptureError ? (
                        <p className="text-xs text-destructive">{party.status.audioCaptureError}</p>
                    ) : null}
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

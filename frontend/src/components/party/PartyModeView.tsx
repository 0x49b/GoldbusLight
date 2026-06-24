import {useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import type {
    DMXFixture,
    DMXPartyAudioInputDevice,
    DMXPartyAudioSourcePreset,
    DMXPartyConfig,
    DMXPartyState,
    WLEDDevice,
} from "@/types/controller.ts";
import {
    formatPartyTimestamp,
    listUSBMicDevices,
    pickLoopbackDevice,
    pickUSBMicDevice
} from "@/lib/dmxPartyAudio";
import {PartyAudioEqualizer} from "@/components/party/PartyAudioEqualizer";
import {partySelectableFixtures} from "@/lib/dmxFixtureMasterSlave";

type PartyModeViewProps = {
    fixtures: DMXFixture[];
    wledDevices: WLEDDevice[];
    party: DMXPartyState;
    busy: boolean;
    audioInputDevices: DMXPartyAudioInputDevice[];
    onRefreshAudioDevices: () => Promise<void>;
    onUpdateConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    onStart: () => Promise<boolean>;
    onStop: () => Promise<void>;
};

type PartySliderField =
    "intensity"
    | "speed"
    | "movementRange"
    | "colorVariation"
    | "audioSensitivity"
    | "smokeVolume";

const DEFAULT_MOVEMENT_RANGE = 70;

type PartySmokeDraft = {
    burstOnSec: number;
    burstOffSec: number;
    volume: number;
};

const DEFAULT_SMOKE_BURST_ON_MS = 2500;
const DEFAULT_SMOKE_BURST_OFF_MS = 45000;
const DEFAULT_SMOKE_VOLUME = 55;

function normalizePercent(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(v)));
}

function clampMs(v: number, min: number, max: number, fallback: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.max(min, Math.min(max, n));
}

function smokeDraftFromConfig(config: DMXPartyConfig): PartySmokeDraft {
    const onMs = clampMs(config.smokeBurstOnMs ?? DEFAULT_SMOKE_BURST_ON_MS, 200, 15000, DEFAULT_SMOKE_BURST_ON_MS);
    const offMs = clampMs(config.smokeBurstOffMs ?? DEFAULT_SMOKE_BURST_OFF_MS, 1000, 300000, DEFAULT_SMOKE_BURST_OFF_MS);
    return {
        burstOnSec: onMs / 1000,
        burstOffSec: offMs / 1000,
        volume: normalizePercent(config.smokeVolume ?? DEFAULT_SMOKE_VOLUME),
    };
}

function isAtmosphereFixture(fixture: DMXFixture): boolean {
    return fixture.type === "smoke" || fixture.type === "hazer";
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

export function PartyModeView({
                                  fixtures,
                                  wledDevices,
                                  party,
                                  busy,
                                  audioInputDevices,
                                  onRefreshAudioDevices,
                                  onUpdateConfig,
                                  onStart,
                                  onStop,
                              }: PartyModeViewProps) {
    const config = party.config;
    const running = party.status.running;
    const mode = config.mode || "auto";
    const partyFixtures = useMemo(() => partySelectableFixtures(fixtures), [fixtures]);
    const selectedFixtureIDs = new Set(config.fixtureIds ?? []);
    const selectedWledIDs = new Set(config.wledDeviceIds ?? []);
    const allFixturesSelected =
        partyFixtures.length > 0 && partyFixtures.every((fixture) => selectedFixtureIDs.has(fixture.id));
    const allWledSelected = wledDevices.length > 0 && wledDevices.every((device) => selectedWledIDs.has(device.id));
    const hasTargets = selectedFixtureIDs.size > 0 || selectedWledIDs.size > 0;

    const hasSmokeFixtures = partyFixtures.some(isAtmosphereFixture);
    const atmosphereFixtures = useMemo(
        () => partyFixtures.filter(isAtmosphereFixture),
        [partyFixtures],
    );
    const selectedSmokeCount = atmosphereFixtures.filter((fixture) =>
        selectedFixtureIDs.has(fixture.id),
    ).length;
    const smokeAutoIncluded = atmosphereFixtures.filter(
        (fixture) => (config.smokeVolume ?? DEFAULT_SMOKE_VOLUME) > 0,
    );

    const [audioSourcePreset, setAudioSourcePreset] = useState<DMXPartyAudioSourcePreset>(() =>
        inferAudioSourcePreset(config, audioInputDevices),
    );
    const [sliderDraft, setSliderDraft] = useState<Record<PartySliderField, number>>({
        intensity: normalizePercent(config.intensity),
        speed: normalizePercent(config.speed),
        movementRange: normalizePercent(config.movementRange ?? DEFAULT_MOVEMENT_RANGE),
        colorVariation: normalizePercent(config.colorVariation),
        audioSensitivity: normalizePercent(config.audioSensitivity),
        smokeVolume: normalizePercent(config.smokeVolume ?? DEFAULT_SMOKE_VOLUME),
    });
    const [smokeDraft, setSmokeDraft] = useState<PartySmokeDraft>(() => smokeDraftFromConfig(config));

    useEffect(() => {
        setAudioSourcePreset(inferAudioSourcePreset(config, audioInputDevices));
    }, [config.audioInputDeviceId, audioInputDevices]);

    useEffect(() => {
        setSliderDraft({
            intensity: normalizePercent(config.intensity),
            speed: normalizePercent(config.speed),
            movementRange: normalizePercent(config.movementRange ?? DEFAULT_MOVEMENT_RANGE),
            colorVariation: normalizePercent(config.colorVariation),
            audioSensitivity: normalizePercent(config.audioSensitivity),
            smokeVolume: normalizePercent(config.smokeVolume ?? DEFAULT_SMOKE_VOLUME),
        });
        setSmokeDraft(smokeDraftFromConfig(config));
    }, [
        config.intensity,
        config.speed,
        config.movementRange,
        config.colorVariation,
        config.audioSensitivity,
        config.smokeVolume,
        config.smokeBurstOnMs,
        config.smokeBurstOffMs,
    ]);

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

    const setSlider = (field: PartySliderField, raw: number) => {
        if (field === "smokeVolume") {
            void onUpdateConfig({smokeVolume: normalizePercent(raw)});
            return;
        }
        void onUpdateConfig({[field]: normalizePercent(raw)});
    };

    const setSmokeBurstOnSec = (rawSec: number) => {
        const sec = Math.max(0.2, Math.min(15, rawSec));
        void onUpdateConfig({smokeBurstOnMs: Math.round(sec * 1000)});
    };

    const setSmokeBurstOffSec = (rawSec: number) => {
        const sec = Math.max(5, Math.min(300, rawSec));
        void onUpdateConfig({smokeBurstOffMs: Math.round(sec * 1000)});
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

    const toggleWled = (deviceId: string) => {
        const next = new Set(config.wledDeviceIds ?? []);
        if (next.has(deviceId)) {
            next.delete(deviceId);
        } else {
            next.add(deviceId);
        }
        void onUpdateConfig({wledDeviceIds: Array.from(next)});
    };

    const renderSlider = (
        field: PartySliderField,
        label: string,
        value: number,
    ) => (
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-medium">{label}: {normalizePercent(value)}%</span>
            <Slider
                min={0}
                max={100}
                step={1}
                value={[normalizePercent(value)]}
                disabled={busy}
                onValueChange={([next]) =>
                    setSliderDraft((prev) => ({
                        ...prev,
                        [field]: normalizePercent(next ?? 0),
                    }))
                }
                onValueCommit={([next]) => setSlider(field, next ?? 0)}
            />
        </label>
    );

    return (
        <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold">Party Mode</h2>
                    <p className="text-xs text-muted-foreground">
                        Unified automode for selected WLED devices and DMX fixtures.
                        {running && (
                            <>
                                <span>&nbsp;Last frame: {formatPartyTimestamp(party.status.lastFrameAt)}</span>
                                <>{mode === "audio" && (
                                    <span>&nbsp;Last audio: {formatPartyTimestamp(party.status.lastAudioAt)}</span>
                                )}</>
                            </>
                        )}
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
                        disabled={(busy && !running) || (!running && !hasTargets)}
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


            <div className="flex flex-wrap gap-3">
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
                {renderSlider("intensity", "Intensity", sliderDraft.intensity)}
                {renderSlider("speed", "Speed", sliderDraft.speed)}
                {renderSlider("movementRange", "Movement range", sliderDraft.movementRange)}
                {renderSlider("colorVariation", "Color variation", sliderDraft.colorVariation)}
                {mode === "audio" && renderSlider("audioSensitivity", "Audio sensitivity", sliderDraft.audioSensitivity)}
            </div>

            {hasSmokeFixtures && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <div>
                        <h3 className="text-sm font-medium">Smoke / fog bursts</h3>
                        <p className="text-xs text-muted-foreground">
                            Short bursts with pauses between them. When burst volume is above 0, all
                            smoke and
                            hazer fixtures run automatically
                            {smokeAutoIncluded.length > 0
                                ? `: ${smokeAutoIncluded.map((f) => f.name).join(", ")}.`
                                : "."}
                            {selectedSmokeCount > 0 ? ` ${selectedSmokeCount} also checked in DMX targets.` : ""}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <label
                            className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium">
                                Burst duration: {smokeDraft.burstOnSec.toFixed(1)} s
                            </span>
                            <Slider
                                min={0.2}
                                max={15}
                                step={0.1}
                                value={[smokeDraft.burstOnSec]}
                                disabled={busy}
                                onValueChange={([next]) =>
                                    setSmokeDraft((prev) => ({
                                        ...prev,
                                        burstOnSec: Math.max(0.2, Math.min(15, next ?? prev.burstOnSec)),
                                    }))
                                }
                                onValueCommit={([next]) => setSmokeBurstOnSec(next ?? smokeDraft.burstOnSec)}
                            />
                        </label>
                        <label
                            className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium">
                                Pause between bursts: {Math.round(smokeDraft.burstOffSec)} s
                            </span>
                            <Slider
                                min={5}
                                max={300}
                                step={1}
                                value={[smokeDraft.burstOffSec]}
                                disabled={busy}
                                onValueChange={([next]) =>
                                    setSmokeDraft((prev) => ({
                                        ...prev,
                                        burstOffSec: Math.max(5, Math.min(300, next ?? prev.burstOffSec)),
                                    }))
                                }
                                onValueCommit={([next]) => setSmokeBurstOffSec(next ?? smokeDraft.burstOffSec)}
                            />
                        </label>
                        {renderSlider("smokeVolume", "Burst volume", sliderDraft.smokeVolume)}
                    </div>
                </div>
            )}

            {mode === "audio" && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <label
                            className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
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
                            <label
                                className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
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
                            <label
                                className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
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

                    <PartyAudioEqualizer audio={party.audio}/>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            Capture: {party.status.audioCapturing ? "active (native)" : running ? "starting…" : "starts with Party"}
                        </span>
                        {party.status.audioNoSignal &&
                            <span className="text-amber-600">No signal detected</span>}
                    </div>

                    {audioSourcePreset === "loopback" && loopbackDevices.length === 0 && (
                        <p className="text-xs text-amber-600">No loopback device found.</p>
                    )}
                    {party.status.audioCaptureError ? (
                        <p className="text-xs text-destructive">{party.status.audioCaptureError}</p>
                    ) : null}
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-muted/20 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                            className="text-xs font-medium text-muted-foreground">WLED targets</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy || wledDevices.length === 0}
                            onClick={() => void onUpdateConfig({wledDeviceIds: allWledSelected ? [] : wledDevices.map((d) => d.id)})}
                        >
                            {allWledSelected ? "Clear selection" : "Select all"}
                        </Button>
                    </div>
                    <div className="grid max-h-36 grid-cols-1 gap-1 overflow-auto pr-1">
                        {wledDevices.map((device) => (
                            <label key={device.id}
                                   className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50">
                                <input
                                    type="checkbox"
                                    checked={selectedWledIDs.has(device.id)}
                                    disabled={busy}
                                    onChange={() => toggleWled(device.id)}
                                />
                                <span className="truncate">{device.name}</span>
                            </label>
                        ))}
                        {wledDevices.length === 0 && (
                            <p className="text-xs text-muted-foreground">No online WLED devices
                                available.</p>
                        )}
                    </div>
                </div>

                <div className="rounded-md border bg-muted/20 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                            className="text-xs font-medium text-muted-foreground">DMX targets</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy || partyFixtures.length === 0}
                            onClick={() => void onUpdateConfig({fixtureIds: allFixturesSelected ? [] : partyFixtures.map((f) => f.id)})}
                        >
                            {allFixturesSelected ? "Clear selection" : "Select all"}
                        </Button>
                    </div>
                    <div className="grid max-h-36 grid-cols-1 gap-1 overflow-auto pr-1">
                        {partyFixtures.map((fixture) => (
                            <label key={fixture.id}
                                   className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50">
                                <input
                                    type="checkbox"
                                    checked={selectedFixtureIDs.has(fixture.id)}
                                    disabled={busy}
                                    onChange={() => toggleFixture(fixture.id)}
                                />
                                <span className="truncate">{fixture.name}</span>
                            </label>
                        ))}
                        {partyFixtures.length === 0 && (
                            <p className="text-xs text-muted-foreground">No DMX fixtures
                                available.</p>
                        )}
                    </div>
                </div>
            </div>

            {party.status.error ? (
                <p className="text-xs text-destructive">{party.status.error}</p>
            ) : null}
        </section>
    );
}

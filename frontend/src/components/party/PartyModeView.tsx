import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {TransferList} from "@/components/scenes/TransferList";
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
import {
    PARTY_CHANNEL_GROUPS,
    partyChannelGroupEnabled,
    togglePartyChannelGroup,
} from "@/lib/dmxPartyChannelGroups";

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
    | "movementAngleLimitDeg"
    | "colorVariation"
    | "audioSensitivity"
    | "smokeVolume";

type PartyConfigTab = "wled" | "dmx" | "smoke";

function parsePartyConfigTab(value: string): PartyConfigTab {
    if (value === "dmx" || value === "smoke") {
        return value;
    }
    return "wled";
}

const DEFAULT_MOVEMENT_RANGE = 70;
const DEFAULT_MOVEMENT_ANGLE_LIMIT_DEG = 45;

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

function normalizeAngleLimit(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Math.max(0, Math.min(180, Math.round(v)));
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
    const {t} = useTranslation("party");
    const config = party.config;
    const running = party.status.running;
    const mode = config.mode || "auto";
    const partyFixtures = useMemo(() => partySelectableFixtures(fixtures), [fixtures]);
    const dmxPartyFixtures = useMemo(
        () => partyFixtures.filter((fixture) => !isAtmosphereFixture(fixture)),
        [partyFixtures],
    );
    const smokePartyFixtures = useMemo(
        () => partyFixtures.filter(isAtmosphereFixture),
        [partyFixtures],
    );
    const fixtureIds = config.fixtureIds ?? [];
    const wledDeviceIds = config.wledDeviceIds ?? [];
    const hasTargets = fixtureIds.length > 0 || wledDeviceIds.length > 0;

    const dmxIncludedIds = useMemo(() => {
        const allowed = new Set(dmxPartyFixtures.map((fixture) => fixture.id));
        return fixtureIds.filter((id) => allowed.has(id));
    }, [fixtureIds, dmxPartyFixtures]);

    const smokeIncludedIds = useMemo(() => {
        const allowed = new Set(smokePartyFixtures.map((fixture) => fixture.id));
        return fixtureIds.filter((id) => allowed.has(id));
    }, [fixtureIds, smokePartyFixtures]);

    const wledItems = useMemo(
        () =>
            wledDevices.map((device) => ({
                id: device.id,
                label: device.name || device.host || device.id,
                hint: device.online ? t("online") : t("offline"),
            })),
        [wledDevices, t],
    );

    const dmxItems = useMemo(
        () =>
            dmxPartyFixtures.map((fixture) => ({
                id: fixture.id,
                label: [fixture.brand, fixture.name].filter(Boolean).join(" ") || fixture.id,
                hint: fixture.type,
            })),
        [dmxPartyFixtures],
    );

    const smokeItems = useMemo(
        () =>
            smokePartyFixtures.map((fixture) => ({
                id: fixture.id,
                label: [fixture.brand, fixture.name].filter(Boolean).join(" ") || fixture.id,
                hint: fixture.type,
            })),
        [smokePartyFixtures],
    );

    const smokeAutoIncluded = smokePartyFixtures.filter(
        (fixture) => (config.smokeVolume ?? DEFAULT_SMOKE_VOLUME) > 0,
    );

    const [activeTab, setActiveTab] = useState<PartyConfigTab>(() =>
        wledDevices.length > 0 ? "wled" : "dmx",
    );
    const [audioSourcePreset, setAudioSourcePreset] = useState<DMXPartyAudioSourcePreset>(() =>
        inferAudioSourcePreset(config, audioInputDevices),
    );
    const [sliderDraft, setSliderDraft] = useState<Record<PartySliderField, number>>({
        intensity: normalizePercent(config.intensity),
        speed: normalizePercent(config.speed),
        movementRange: normalizePercent(config.movementRange ?? DEFAULT_MOVEMENT_RANGE),
        movementAngleLimitDeg: normalizeAngleLimit(config.movementAngleLimitDeg ?? DEFAULT_MOVEMENT_ANGLE_LIMIT_DEG),
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
            movementAngleLimitDeg: normalizeAngleLimit(config.movementAngleLimitDeg ?? DEFAULT_MOVEMENT_ANGLE_LIMIT_DEG),
            colorVariation: normalizePercent(config.colorVariation),
            audioSensitivity: normalizePercent(config.audioSensitivity),
            smokeVolume: normalizePercent(config.smokeVolume ?? DEFAULT_SMOKE_VOLUME),
        });
        setSmokeDraft(smokeDraftFromConfig(config));
    }, [
        config.intensity,
        config.speed,
        config.movementRange,
        config.movementAngleLimitDeg,
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
        if (field === "movementAngleLimitDeg") {
            void onUpdateConfig({movementAngleLimitDeg: normalizeAngleLimit(raw)});
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

    const replaceFixtureGroupIncluded = (group: DMXFixture[], nextIncludedIds: string[]) => {
        const groupIds = new Set(group.map((fixture) => fixture.id));
        const preserved = (config.fixtureIds ?? []).filter((id) => !groupIds.has(id));
        const nextGroup = nextIncludedIds.filter((id) => groupIds.has(id));
        void onUpdateConfig({fixtureIds: [...preserved, ...nextGroup]});
    };

    const renderSlider = (
        field: PartySliderField,
        label: string,
        value: number,
        options?: {min?: number; max?: number; step?: number; format?: (v: number) => string},
    ) => {
        const min = options?.min ?? 0;
        const max = options?.max ?? 100;
        const step = options?.step ?? 1;
        const display = options?.format ? options.format(value) : `${normalizePercent(value)}%`;
        const normalizedValue = field === "movementAngleLimitDeg"
            ? normalizeAngleLimit(value)
            : normalizePercent(value);
        return (
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-medium">{label}: {display}</span>
            <Slider
                min={min}
                max={max}
                step={step}
                value={[normalizedValue]}
                disabled={busy}
                onValueChange={([next]) =>
                    setSliderDraft((prev) => ({
                        ...prev,
                        [field]: field === "movementAngleLimitDeg"
                            ? normalizeAngleLimit(next ?? 0)
                            : normalizePercent(next ?? 0),
                    }))
                }
                onValueCommit={([next]) => setSlider(field, next ?? 0)}
            />
        </label>
        );
    };

    return (
        <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold">{t("title")}</h2>
                    <p className="text-xs text-muted-foreground">
                        {t("description")}
                        {running && (
                            <>
                                <span>{t("lastFrame", {time: formatPartyTimestamp(party.status.lastFrameAt)})}</span>
                                {mode === "audio" && (
                                    <span>{t("lastAudio", {time: formatPartyTimestamp(party.status.lastAudioAt)})}</span>
                                )}
                            </>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {running ? t("running") : t("stopped")}
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
                        {running ? t("stopParty") : t("startParty")}
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
                    <span className="font-medium">{t("mode.label")}</span>
                    <select
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                        value={mode}
                        disabled={busy}
                        onChange={(event) => {
                            const nextMode = event.target.value === "audio" ? "audio" : "auto";
                            void onUpdateConfig({mode: nextMode});
                        }}
                    >
                        <option value="auto">{t("mode.auto")}</option>
                        <option value="audio">{t("mode.audio")}</option>
                    </select>
                </label>
                {mode === "audio" && renderSlider("audioSensitivity", t("audioSensitivity"), sliderDraft.audioSensitivity)}
            </div>

            {mode === "audio" && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <label
                            className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium">{t("audio.sourcePreset")}</span>
                            <select
                                className="rounded-md border bg-background px-2 py-1 text-sm"
                                value={audioSourcePreset}
                                disabled={busy}
                                onChange={(event) => {
                                    const preset = event.target.value as DMXPartyAudioSourcePreset;
                                    void applyAudioPreset(preset);
                                }}
                            >
                                <option value="mic">{t("audio.presetMic")}</option>
                                <option value="usbMic">{t("audio.presetUsbMic")}</option>
                                <option value="loopback">{t("audio.presetLoopback")}</option>
                                <option value="custom">{t("audio.presetCustom")}</option>
                            </select>
                        </label>

                        {audioSourcePreset === "usbMic" && (
                            <label
                                className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                                <span className="font-medium">{t("audio.usbMic")}</span>
                                <select
                                    className="rounded-md border bg-background px-2 py-1 text-sm"
                                    value={config.audioInputDeviceId || ""}
                                    disabled={busy || usbMicDevices.length === 0}
                                    onChange={(event) => {
                                        void onUpdateConfig({audioInputDeviceId: event.target.value});
                                    }}
                                >
                                    {usbMicDevices.length === 0 ? (
                                        <option value="">{t("audio.noUsbMic")}</option>
                                    ) : (
                                        usbMicDevices.map((device) => (
                                            <option key={device.id} value={device.id}>
                                                {device.name || t("audio.usbMicPlaceholder", {id: device.id.slice(0, 6)})}
                                                {device.isDefault ? t("audio.systemDefaultSuffix") : ""}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </label>
                        )}

                        {audioSourcePreset === "custom" && (
                            <label
                                className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                                <span className="font-medium">{t("audio.inputDevice")}</span>
                                <select
                                    className="rounded-md border bg-background px-2 py-1 text-sm"
                                    value={config.audioInputDeviceId || ""}
                                    disabled={busy}
                                    onChange={(event) => {
                                        void onUpdateConfig({audioInputDeviceId: event.target.value});
                                    }}
                                >
                                    <option value="">{t("audio.defaultInput")}</option>
                                    {audioInputDevices.map((device) => (
                                        <option key={device.id} value={device.id}>
                                            {device.name || t("audio.audioInputPlaceholder", {id: device.id.slice(0, 6)})}
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
                            {t("audio.refreshDevices")}
                        </Button>
                    </div>

                    <PartyAudioEqualizer audio={party.audio}/>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            {party.status.audioCapturing
                                ? t("audio.captureActive")
                                : running
                                    ? t("audio.captureStarting")
                                    : t("audio.captureStartsWithParty")}
                        </span>
                        {party.status.audioNoSignal &&
                            <span className="text-amber-600">{t("audio.noSignal")}</span>}
                    </div>

                    {audioSourcePreset === "loopback" && loopbackDevices.length === 0 && (
                        <p className="text-xs text-amber-600">{t("audio.noLoopback")}</p>
                    )}
                    {party.status.audioCaptureError ? (
                        <p className="text-xs text-destructive">{party.status.audioCaptureError}</p>
                    ) : null}
                </div>
            )}

            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(parsePartyConfigTab(value))}
                className="gap-3"
            >
                <TabsList>
                    <TabsTrigger value="wled">{t("tabs.wled")}</TabsTrigger>
                    <TabsTrigger value="dmx">{t("tabs.dmx")}</TabsTrigger>
                    <TabsTrigger value="smoke">{t("tabs.smoke")}</TabsTrigger>
                </TabsList>

                <TabsContent value="wled" className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        {t("wled.description")}
                    </p>

                    <div className="flex flex-wrap gap-3">
                        {renderSlider("intensity", t("sliders.intensity"), sliderDraft.intensity)}
                        {renderSlider("speed", t("sliders.speed"), sliderDraft.speed)}
                        {renderSlider("colorVariation", t("sliders.colorVariation"), sliderDraft.colorVariation)}
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">{t("wled.targets")}</div>
                        <TransferList
                            availableLabel={t("targets.available")}
                            includedLabel={t("targets.included")}
                            items={wledItems}
                            includedIds={wledDeviceIds}
                            disabled={busy}
                            onChange={(ids) => {
                                void onUpdateConfig({wledDeviceIds: ids});
                            }}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="dmx" className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                        {renderSlider("intensity", t("sliders.intensity"), sliderDraft.intensity)}
                        {renderSlider("speed", t("sliders.speed"), sliderDraft.speed)}
                        {renderSlider("colorVariation", t("sliders.colorVariation"), sliderDraft.colorVariation)}
                        {renderSlider("movementRange", t("sliders.movementRange"), sliderDraft.movementRange)}
                        {renderSlider(
                            "movementAngleLimitDeg",
                            t("sliders.movementAngleLimit"),
                            sliderDraft.movementAngleLimitDeg,
                            {
                                min: 0,
                                max: 180,
                                step: 1,
                                format: (v) => (v <= 0 ? t("angle.off") : t("angle.value", {value: v})),
                            },
                        )}
                    </div>

                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                        <div>
                            <h3 className="text-sm font-medium">{t("dmx.animated.title")}</h3>
                            <p className="text-xs text-muted-foreground">
                                {t("dmx.animated.description")}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {PARTY_CHANNEL_GROUPS.map((group) => (
                                <label
                                    key={group.id}
                                    className="flex min-w-[10rem] items-start gap-2 text-xs"
                                    title={group.description}
                                >
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={partyChannelGroupEnabled(config, group.id)}
                                        disabled={busy}
                                        onChange={(event) => {
                                            void onUpdateConfig(
                                                togglePartyChannelGroup(config, group.id, event.target.checked),
                                            );
                                        }}
                                    />
                                    <span>
                                        <span className="font-medium">{group.label}</span>
                                        <span className="block text-muted-foreground">{group.description}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">{t("dmx.targets")}</div>
                        <TransferList
                            availableLabel={t("targets.available")}
                            includedLabel={t("targets.included")}
                            items={dmxItems}
                            includedIds={dmxIncludedIds}
                            disabled={busy}
                            onChange={(ids) => replaceFixtureGroupIncluded(dmxPartyFixtures, ids)}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="smoke" className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        {t("smoke.description")}
                    </p>

                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                        <div>
                            <h3 className="text-sm font-medium">{t("smoke.sectionTitle")}</h3>
                            <p className="text-xs text-muted-foreground">
                                {t("smoke.sectionDescription")}
                                {smokeAutoIncluded.length > 0
                                    ? t("smoke.autoIncluded", {names: smokeAutoIncluded.map((f) => f.name).join(", ")})
                                    : t("smoke.autoIncludedNone")}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <label
                                className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                                <span className="font-medium">
                                    {t("smoke.burstDuration", {value: smokeDraft.burstOnSec.toFixed(1)})}
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
                                    {t("smoke.burstPause", {value: Math.round(smokeDraft.burstOffSec)})}
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
                            {renderSlider("smokeVolume", t("sliders.smokeVolume"), sliderDraft.smokeVolume)}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">{t("smoke.targets")}</div>
                        <TransferList
                            availableLabel={t("targets.available")}
                            includedLabel={t("targets.included")}
                            items={smokeItems}
                            includedIds={smokeIncludedIds}
                            disabled={busy}
                            onChange={(ids) => replaceFixtureGroupIncluded(smokePartyFixtures, ids)}
                        />
                    </div>
                </TabsContent>
            </Tabs>

            {party.status.error ? (
                <p className="text-xs text-destructive">{party.status.error}</p>
            ) : null}
        </section>
    );
}

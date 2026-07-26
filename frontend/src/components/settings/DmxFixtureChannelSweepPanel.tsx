import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import * as GreetService from "../../../bindings/goldbus/internal/service/goldbuslightservice";
import { DMXOutputUpdate } from "../../../bindings/goldbus/internal/dmx/models";
import type { ControllerSettings, DMXChannel, DMXFixture, USBSerialDevice } from "@/types/controller";

function clampDmxByte(v: number): number {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function absoluteDmxAddress(base: number, channelOffset: number): number | null {
    const b = Number.isFinite(base) ? Math.round(base) : 1;
    const o = Number.isFinite(channelOffset) ? Math.round(channelOffset) : 1;
    if (b < 1 || b > 512 || o < 1) {
        return null;
    }
    const addr = b + o - 1;
    if (addr < 1 || addr > 512) {
        return null;
    }
    return addr;
}

function buildFullBlackoutPatch(): DMXOutputUpdate[] {
    const out: DMXOutputUpdate[] = [];
    for (let a = 1; a <= 512; a++) {
        out.push(new DMXOutputUpdate({ address: a, value: 0 }));
    }
    return out;
}

function sortFixtureChannels(channels: DMXChannel[]): DMXChannel[] {
    return [...channels].filter((c) => c.channel >= 1).sort((a, b) => a.channel - b.channel);
}

function sweepBaselineValue(channel: DMXChannel): number {
    if (
        channel.type === "dimmer" ||
        channel.type === "dimmerFine" ||
        channel.type === "onOff" ||
        channel.type === "lamp" ||
        channel.type === "colorComponent"
    ) {
        return 255;
    }
    return 0;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

export type DmxFixtureChannelSweepPanelProps = {
    fixtures: DMXFixture[];
    dmxEnabled: boolean;
    settings: ControllerSettings | null;
    selectedUSBDeviceId: string | null;
    usbSerialDevices: USBSerialDevice[];
    partyRunning: boolean;
    busy: boolean;
    startDMXLiveOutput: (fixtureId: string) => Promise<boolean>;
    setError: (msg: string) => void;
};

export function DmxFixtureChannelSweepPanel({
    fixtures,
    dmxEnabled,
    settings,
    selectedUSBDeviceId,
    usbSerialDevices,
    partyRunning,
    busy,
    startDMXLiveOutput,
    setError,
}: DmxFixtureChannelSweepPanelProps) {
    const [fixtureId, setFixtureId] = useState<string>("");
    const [speed, setSpeed] = useState<number>(25);
    const [running, setRunning] = useState(false);
    const [fixtureChannelIndex, setFixtureChannelIndex] = useState(0);
    const [fixtureChannelOffset, setFixtureChannelOffset] = useState(1);
    const [dmxAddress, setDmxAddress] = useState(1);
    const [value, setValue] = useState(0);
    const [paused, setPaused] = useState(false);
    const [pauseLog, setPauseLog] = useState<string[]>([]);

    const abortRef = useRef(false);
    const pausedRef = useRef(false);
    const pauseLogRef = useRef<string[]>([]);
    const runningRef = useRef(false);

    const selectedFixture = useMemo(
        () => fixtures.find((f) => f.id === fixtureId) ?? null,
        [fixtures, fixtureId],
    );

    const sortedChannels = useMemo(
        () => (selectedFixture ? sortFixtureChannels(selectedFixture.channels) : []),
        [selectedFixture],
    );

    const transportSummary = useMemo(() => {
        if (!settings?.dmx) {
            return "—";
        }
        const d = settings.dmx;
        const parts: string[] = [];
        if (d.usb.enabled !== false) {
            const id = selectedUSBDeviceId ?? "";
            const dev = usbSerialDevices.find((u) => u.id === id);
            if (id && dev) {
                parts.push(`USB: ${dev.name} (${dev.path})`);
            } else if (id) {
                parts.push(`USB: selected device unavailable (${id})`);
            } else {
                parts.push("USB: no device selected");
            }
        } else {
            parts.push("USB transport off");
        }
        if (d.artNet.enabled) {
            parts.push(`Art-Net → ${d.artNet.targetHost}:${d.artNet.port} (N${d.artNet.net} S${d.artNet.subnet} U${d.artNet.universe})`);
        } else {
            parts.push("Art-Net off");
        }
        return parts.join(" · ");
    }, [settings, selectedUSBDeviceId, usbSerialDevices]);

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    useEffect(() => {
        runningRef.current = running;
    }, [running]);

    const appendPauseLog = useCallback((line: string) => {
        pauseLogRef.current = [...pauseLogRef.current, line];
        setPauseLog(pauseLogRef.current);
    }, []);

    const togglePause = useCallback(() => {
        setPaused((p) => {
            const next = !p;
            if (next) {
                const ts = new Date().toISOString();
                appendPauseLog(
                    `${ts}  Pause  DMX ${dmxAddress}  fixture ch ${fixtureChannelOffset}  value ${value}`,
                );
            }
            return next;
        });
    }, [appendPauseLog, dmxAddress, fixtureChannelOffset, value]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code !== "Space") {
                return;
            }
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
                return;
            }
            if (!running) {
                return;
            }
            e.preventDefault();
            togglePause();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [running, togglePause]);

    const stopSweep = useCallback(async () => {
        abortRef.current = true;
        pausedRef.current = false;
        setPaused(false);
        try {
            await GreetService.ApplyDMXLivePatch(buildFullBlackoutPatch());
        } catch {
            /* ignore */
        }
        // Keep automatic DMX streaming; restore connection if the sweep had restarted it.
        try {
            await startDMXLiveOutput("");
        } catch {
            /* ignore */
        }
        runningRef.current = false;
        setRunning(false);
    }, [startDMXLiveOutput]);

    const runSweep = useCallback(async () => {
        if (!selectedFixture || sortedChannels.length === 0) {
            setError("Select a fixture with at least one DMX channel.");
            return;
        }
        if (partyRunning) {
            setError("Stop party mode before running the channel sweep test.");
            return;
        }
        setError("");
        abortRef.current = false;
        pauseLogRef.current = [];
        setPauseLog([]);
        setPaused(false);
        pausedRef.current = false;
        setRunning(true);
        runningRef.current = true;

        const delayMs = Math.max(4, Math.round(260 - speed * 2.5));

        try {
            const ok = await startDMXLiveOutput(selectedFixture.id);
            if (!ok || abortRef.current) {
                return;
            }
            await GreetService.ApplyDMXLivePatch(buildFullBlackoutPatch());

            const base = selectedFixture.dmxAddress;
            const baselineByOffset = new Map<number, number>();
            for (const c of sortedChannels) {
                baselineByOffset.set(c.channel, sweepBaselineValue(c));
            }

            outer: for (let ci = 0; ci < sortedChannels.length; ci++) {
                const ch = sortedChannels[ci];
                const addr = absoluteDmxAddress(base, ch.channel);
                if (addr == null) {
                    continue;
                }
                setFixtureChannelIndex(ci);
                setFixtureChannelOffset(ch.channel);

                for (let v = 0; v <= 255; v++) {
                    if (abortRef.current) {
                        break outer;
                    }
                    while (pausedRef.current && !abortRef.current) {
                        await delay(40);
                    }
                    if (abortRef.current) {
                        break outer;
                    }

                    const updates: DMXOutputUpdate[] = [];
                    for (const c of sortedChannels) {
                        const a = absoluteDmxAddress(base, c.channel);
                        if (a == null) {
                            continue;
                        }
                        updates.push(
                            new DMXOutputUpdate({
                                address: a,
                                value: c.channel === ch.channel
                                    ? clampDmxByte(v)
                                    : clampDmxByte(baselineByOffset.get(c.channel) ?? 0),
                            }),
                        );
                    }

                    try {
                        await GreetService.ApplyDMXLivePatch(updates);
                    } catch (err) {
                        setError(String(err));
                        break outer;
                    }

                    setDmxAddress(addr);
                    setValue(v);
                    await delay(delayMs);
                }
            }

            if (!abortRef.current) {
                try {
                    await GreetService.ApplyDMXLivePatch(buildFullBlackoutPatch());
                } catch {
                    /* ignore */
                }
            }
        } finally {
            try {
                await GreetService.ApplyDMXLivePatch(buildFullBlackoutPatch());
            } catch {
                /* ignore */
            }
            try {
                await startDMXLiveOutput("");
            } catch {
                /* ignore */
            }
            runningRef.current = false;
            setRunning(false);
        }
    }, [partyRunning, selectedFixture, sortedChannels, setError, speed, startDMXLiveOutput]);

    useEffect(() => {
        return () => {
            if (!runningRef.current) {
                return;
            }
            abortRef.current = true;
            void GreetService.ApplyDMXLivePatch(buildFullBlackoutPatch()).catch(() => {
                /* ignore */
            });
            void GreetService.StartDMXLive("").catch(() => {
                /* ignore */
            });
        };
    }, []);

    const startDisabled =
        !dmxEnabled ||
        partyRunning ||
        busy ||
        running ||
        !fixtureId ||
        sortedChannels.length === 0;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">DMX fixture channel sweep (test mode)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Sweeps each configured channel of one fixture from 0→255 while all other channels on that fixture stay at
                    zero. The universe is blacked out first so you can see which physical function responds. Output uses the
                    same USB / Art-Net configuration as the DMX settings above.
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all">{transportSummary}</p>

                {partyRunning && (
                    <Alert>
                        <AlertDescription>Party mode is on — stop it before starting a sweep.</AlertDescription>
                    </Alert>
                )}

                <Field>
                    <FieldLabel>Fixture</FieldLabel>
                    <NativeSelect
                        className="w-full md:w-[28rem]"
                        value={fixtureId}
                        onChange={(e) => setFixtureId(e.target.value)}
                        disabled={running || busy || !dmxEnabled}
                    >
                        <NativeSelectOption value="">Select fixture…</NativeSelectOption>
                        {fixtures.map((f) => (
                            <NativeSelectOption key={f.id} value={f.id}>
                                {f.name} ({f.type}) @ ch {f.dmxAddress}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </Field>

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <Label>Sweep speed</Label>
                        <span className="text-xs text-muted-foreground tabular-nums">{speed}%</span>
                    </div>
                    <Slider
                        min={1}
                        max={100}
                        value={[speed]}
                        onValueChange={(v) => setSpeed(v[0] ?? 25)}
                        disabled={running || busy || !dmxEnabled}
                    />
                    <p className="text-xs text-muted-foreground">Higher is faster (shorter delay between DMX steps).</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void runSweep()} disabled={startDisabled}>
                        Start sweep
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void stopSweep()} disabled={!running}>
                        Stop
                    </Button>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Current step</p>
                    {running || paused ? (
                        <div className="text-sm font-mono space-y-1">
                            <div>
                                Fixture channel offset: <strong>{fixtureChannelOffset}</strong> ({sortedChannels[fixtureChannelIndex]?.type ?? "—"}) ·
                                DMX address: <strong>{dmxAddress}</strong> · Value: <strong>{value}</strong>
                            </div>
                            <div className="text-xs opacity-80">
                                {paused ? "Paused — press Space to resume" : "Running — Space to pause and log this position"}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm opacity-70">Idle</p>
                    )}
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Pause log (Space)</p>
                    <div className="max-h-48 overflow-auto rounded border bg-card p-2 text-xs font-mono whitespace-pre-wrap">
                        {pauseLog.length === 0 ? <span className="opacity-60">No pauses yet.</span> : pauseLog.join("\n")}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

import {useCallback, useMemo} from "react";
import {PiArrowDown, PiArrowUp, PiPlus, PiTrash} from "react-icons/pi";

import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {Separator} from "@/components/ui/separator";
import {Slider} from "@/components/ui/slider";
import type {
    DMXChannel,
    DMXFixturePreset,
    DMXFixturePresetSequence,
    DMXPresetChannelBehavior,
} from "@/types/controller.ts";

type ChannelRole = "pose" | "random" | "exclude";

export type DMXFixturePresetSequenceEditorProps = {
    channels: DMXChannel[];
    value: DMXFixturePresetSequence;
    onChange: (next: DMXFixturePresetSequence) => void;
    busy?: boolean;
};

function clampByte(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(255, Math.round(v)));
}

function channelKey(ch: DMXChannel): string {
    return String(Math.round(ch.channel));
}

function defaultValueFor(ch: DMXChannel): number {
    if (typeof ch.defaultValue === "number" && Number.isFinite(ch.defaultValue)) {
        return clampByte(ch.defaultValue);
    }
    const t = (ch.type ?? "").toLowerCase();
    if (t === "pan" || t === "tilt" || t === "infinitepan" || t === "infinitetilt") {
        return 128;
    }
    return 0;
}

function roleForChannel(seq: DMXFixturePresetSequence, key: string): ChannelRole {
    const b = seq.channelBehaviors?.[key];
    if (b === "random") return "random";
    if (b === "exclude") return "exclude";
    // Default: the channel replays the value stored in each pose.
    return "pose";
}

function newPresetId(): string {
    return `preset-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function DMXFixturePresetSequenceEditor(props: DMXFixturePresetSequenceEditorProps) {
    const {channels, value, onChange, busy} = props;

    const presets = value.presets ?? [];
    const stepMs = typeof value.stepMs === "number" && value.stepMs > 0 ? value.stepMs : 2000;
    const fadeMs = typeof value.fadeMs === "number" && value.fadeMs >= 0 ? value.fadeMs : 0;

    const poseChannels = useMemo(
        () => channels.filter((ch) => roleForChannel(value, channelKey(ch)) === "pose"),
        [channels, value],
    );

    const patch = useCallback(
        (next: Partial<DMXFixturePresetSequence>) => {
            onChange({...value, ...next});
        },
        [onChange, value],
    );

    const setRole = useCallback(
        (ch: DMXChannel, role: ChannelRole) => {
            const key = channelKey(ch);
            const behaviors: Record<string, DMXPresetChannelBehavior> = {...(value.channelBehaviors ?? {})};
            let nextPresets = value.presets ?? [];
            if (role === "pose") {
                delete behaviors[key];
                // Make sure every pose has a value for a channel that now replays it.
                nextPresets = nextPresets.map((p) => {
                    const values = {...(p.values ?? {})};
                    if (!(key in values)) values[key] = defaultValueFor(ch);
                    return {...p, values};
                });
            } else {
                behaviors[key] = role;
            }
            patch({
                presets: nextPresets,
                channelBehaviors: Object.keys(behaviors).length > 0 ? behaviors : undefined,
            });
        },
        [patch, value.channelBehaviors, value.presets],
    );

    const addPreset = useCallback(() => {
        const values: Record<string, number> = {};
        for (const ch of poseChannels) {
            values[channelKey(ch)] = defaultValueFor(ch);
        }
        const next: DMXFixturePreset = {
            id: newPresetId(),
            label: `Pose ${presets.length + 1}`,
            values,
        };
        patch({presets: [...presets, next]});
    }, [patch, poseChannels, presets]);

    const removePreset = useCallback(
        (idx: number) => {
            patch({presets: presets.filter((_, i) => i !== idx)});
        },
        [patch, presets],
    );

    const movePreset = useCallback(
        (idx: number, dir: -1 | 1) => {
            const target = idx + dir;
            if (target < 0 || target >= presets.length) return;
            const next = [...presets];
            [next[idx], next[target]] = [next[target], next[idx]];
            patch({presets: next});
        },
        [patch, presets],
    );

    const setPresetLabel = useCallback(
        (idx: number, label: string) => {
            patch({presets: presets.map((p, i) => (i === idx ? {...p, label} : p))});
        },
        [patch, presets],
    );

    const setPresetValue = useCallback(
        (idx: number, key: string, v: number) => {
            patch({
                presets: presets.map((p, i) =>
                    i === idx ? {...p, values: {...(p.values ?? {}), [key]: clampByte(v)}} : p,
                ),
            });
        },
        [patch, presets],
    );

    const enabled = !!value.enabled;

    return (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm">
                <Checkbox
                    checked={enabled}
                    disabled={busy}
                    onCheckedChange={(v) => patch({enabled: v === true})}
                />
                <span>Step this fixture through saved poses (preset chase)</span>
            </label>
            <p className="text-xs text-muted-foreground">
                When enabled and the fixture is included in party mode, it cycles through the poses below instead of the
                generative algorithm. Pick which channels make up a pose; other channels can be randomized or left
                untouched.
            </p>

            {enabled ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor="preset-step-ms">Time per pose (ms)</Label>
                            <Input
                                id="preset-step-ms"
                                type="number"
                                min={100}
                                max={600000}
                                step={100}
                                value={stepMs}
                                disabled={busy}
                                onChange={(e) =>
                                    patch({stepMs: Math.max(100, Math.min(600000, Math.round(Number(e.target.value) || 2000)))})
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="preset-fade-ms">Crossfade (ms)</Label>
                            <Input
                                id="preset-fade-ms"
                                type="number"
                                min={0}
                                max={Math.min(600000, stepMs)}
                                step={50}
                                value={fadeMs}
                                disabled={busy}
                                onChange={(e) =>
                                    patch({fadeMs: Math.max(0, Math.min(stepMs, Math.round(Number(e.target.value) || 0)))})
                                }
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={value.loop ?? true}
                            disabled={busy}
                            onCheckedChange={(v) => patch({loop: v === true})}
                        />
                        <span>Loop — restart after the last pose (otherwise hold the final pose)</span>
                    </label>

                    <Separator/>

                    <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">Channel roles</p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Pose</span> channels get a value in every pose;{" "}
                            <span className="font-medium">Random</span> channels get a fresh value each step;{" "}
                            <span className="font-medium">Exclude</span> leaves the channel untouched.
                        </p>
                        <div className="grid gap-2">
                            {channels.map((ch) => {
                                const key = channelKey(ch);
                                const role = roleForChannel(value, key);
                                return (
                                    <div key={`${key}-${ch.type}`} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="text-muted-foreground">
                                            Offset {ch.channel} ({ch.type})
                                        </span>
                                        <NativeSelect
                                            size="sm"
                                            value={role}
                                            disabled={busy}
                                            onChange={(e) => setRole(ch, e.target.value as ChannelRole)}
                                        >
                                            <NativeSelectOption value="pose">Pose</NativeSelectOption>
                                            <NativeSelectOption value="random">Random</NativeSelectOption>
                                            <NativeSelectOption value="exclude">Exclude</NativeSelectOption>
                                        </NativeSelect>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <Separator/>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-foreground">Poses ({presets.length})</p>
                            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={addPreset}>
                                <PiPlus className="size-4"/> Add pose
                            </Button>
                        </div>

                        {presets.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No poses yet. Add a pose, then set its values for the channels marked “Pose”.
                            </p>
                        ) : null}

                        {presets.map((preset, idx) => (
                            <div key={preset.id} className="space-y-2 rounded-md border bg-background/50 p-2">
                                <div className="flex items-center gap-2">
                                    <Input
                                        aria-label={`Pose ${idx + 1} label`}
                                        value={preset.label ?? ""}
                                        placeholder={`Pose ${idx + 1}`}
                                        disabled={busy}
                                        onChange={(e) => setPresetLabel(idx, e.target.value)}
                                        className="h-8"
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy || idx === 0}
                                        onClick={() => movePreset(idx, -1)}
                                        aria-label="Move pose up"
                                    >
                                        <PiArrowUp className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy || idx === presets.length - 1}
                                        onClick={() => movePreset(idx, 1)}
                                        aria-label="Move pose down"
                                    >
                                        <PiArrowDown className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => removePreset(idx)}
                                        aria-label="Remove pose"
                                    >
                                        <PiTrash className="size-4"/>
                                    </Button>
                                </div>

                                {poseChannels.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        Mark at least one channel as “Pose” to set values here.
                                    </p>
                                ) : (
                                    <div className="grid gap-2">
                                        {poseChannels.map((ch) => {
                                            const key = channelKey(ch);
                                            const v = clampByte(preset.values?.[key] ?? defaultValueFor(ch));
                                            return (
                                                <label
                                                    key={`${preset.id}-${key}`}
                                                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                                                >
                                                    <span className="font-medium text-foreground">
                                                        Offset {ch.channel} ({ch.type}) — {v}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Slider
                                                            min={0}
                                                            max={255}
                                                            step={1}
                                                            value={[v]}
                                                            disabled={busy}
                                                            onValueChange={([nv]) => setPresetValue(idx, key, nv ?? 0)}
                                                        />
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={255}
                                                            value={v}
                                                            disabled={busy}
                                                            onChange={(e) => setPresetValue(idx, key, Number(e.target.value) || 0)}
                                                            className="h-8 w-20"
                                                        />
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}

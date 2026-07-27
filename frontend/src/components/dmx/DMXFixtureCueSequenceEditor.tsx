import {useCallback, useMemo} from "react";
import {useTranslation} from "react-i18next";
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
    DMXFixtureCue,
    DMXFixtureCueSequence,
    DMXCueChannelBehavior,
} from "@/types/controller.ts";

type ChannelRole = "pose" | "random" | "exclude";

export type DMXFixtureCueSequenceEditorProps = {
    channels: DMXChannel[];
    value: DMXFixtureCueSequence;
    onChange: (next: DMXFixtureCueSequence) => void;
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

function roleForChannel(seq: DMXFixtureCueSequence, key: string): ChannelRole {
    const b = seq.channelBehaviors?.[key];
    if (b === "random") return "random";
    if (b === "exclude") return "exclude";
    return "pose";
}

function newCueId(): string {
    return `cue-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function DMXFixtureCueSequenceEditor(props: DMXFixtureCueSequenceEditorProps) {
    const {channels, value, onChange, busy} = props;
    const {t} = useTranslation("dmx");

    const cues = value.cues ?? [];
    const stepMs = typeof value.stepMs === "number" && value.stepMs > 0 ? value.stepMs : 2000;
    const fadeMs = typeof value.fadeMs === "number" && value.fadeMs >= 0 ? value.fadeMs : 0;

    const poseChannels = useMemo(
        () => channels.filter((ch) => roleForChannel(value, channelKey(ch)) === "pose"),
        [channels, value],
    );

    const patch = useCallback(
        (next: Partial<DMXFixtureCueSequence>) => {
            onChange({...value, ...next});
        },
        [onChange, value],
    );

    const setRole = useCallback(
        (ch: DMXChannel, role: ChannelRole) => {
            const key = channelKey(ch);
            const behaviors: Record<string, DMXCueChannelBehavior> = {...(value.channelBehaviors ?? {})};
            let nextCues = value.cues ?? [];
            if (role === "pose") {
                delete behaviors[key];
                nextCues = nextCues.map((p) => {
                    const values = {...(p.values ?? {})};
                    if (!(key in values)) values[key] = defaultValueFor(ch);
                    return {...p, values};
                });
            } else {
                behaviors[key] = role;
            }
            patch({
                cues: nextCues,
                channelBehaviors: Object.keys(behaviors).length > 0 ? behaviors : undefined,
            });
        },
        [patch, value.channelBehaviors, value.cues],
    );

    const addCue = useCallback(() => {
        const values: Record<string, number> = {};
        for (const ch of poseChannels) {
            values[channelKey(ch)] = defaultValueFor(ch);
        }
        const next: DMXFixtureCue = {
            id: newCueId(),
            label: t("cueSequence.poseFallback", {index: cues.length + 1}),
            values,
        };
        patch({cues: [...cues, next]});
    }, [patch, poseChannels, cues, t]);

    const removeCue = useCallback(
        (idx: number) => {
            patch({cues: cues.filter((_, i) => i !== idx)});
        },
        [patch, cues],
    );

    const moveCue = useCallback(
        (idx: number, dir: -1 | 1) => {
            const target = idx + dir;
            if (target < 0 || target >= cues.length) return;
            const next = [...cues];
            [next[idx], next[target]] = [next[target], next[idx]];
            patch({cues: next});
        },
        [patch, cues],
    );

    const setCueLabel = useCallback(
        (idx: number, label: string) => {
            patch({cues: cues.map((p, i) => (i === idx ? {...p, label} : p))});
        },
        [patch, cues],
    );

    const setCueValue = useCallback(
        (idx: number, key: string, v: number) => {
            patch({
                cues: cues.map((p, i) =>
                    i === idx ? {...p, values: {...(p.values ?? {}), [key]: clampByte(v)}} : p,
                ),
            });
        },
        [patch, cues],
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
                <span>{t("cueSequence.enable")}</span>
            </label>
            <p className="text-xs text-muted-foreground">
                {t("cueSequence.description")}
            </p>

            {enabled ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor="cue-step-ms">{t("cueSequence.timePerPose")}</Label>
                            <Input
                                id="cue-step-ms"
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
                            <Label htmlFor="cue-fade-ms">{t("cueSequence.crossfade")}</Label>
                            <Input
                                id="cue-fade-ms"
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
                        <span>{t("cueSequence.loop")}</span>
                    </label>

                    <Separator/>

                    <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">{t("cueSequence.channelRolesTitle")}</p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{t("cueSequence.channelRolesDescPose")}</span>
                            {t("cueSequence.channelRolesDescPoseAfter")}
                            <span className="font-medium">{t("cueSequence.channelRolesDescRandom")}</span>
                            {t("cueSequence.channelRolesDescRandomAfter")}
                            <span className="font-medium">{t("cueSequence.channelRolesDescExclude")}</span>
                            {t("cueSequence.channelRolesDescExcludeAfter")}
                        </p>
                        <div className="grid gap-2">
                            {channels.map((ch) => {
                                const key = channelKey(ch);
                                const role = roleForChannel(value, key);
                                return (
                                    <div key={`${key}-${ch.type}`} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="text-muted-foreground">
                                            {t("cueSequence.offsetChannelLabel", {offset: ch.channel, type: ch.type})}
                                        </span>
                                        <NativeSelect
                                            size="sm"
                                            value={role}
                                            disabled={busy}
                                            onChange={(e) => setRole(ch, e.target.value as ChannelRole)}
                                        >
                                            <NativeSelectOption value="pose">{t("cueSequence.roleOptions.pose")}</NativeSelectOption>
                                            <NativeSelectOption value="random">{t("cueSequence.roleOptions.random")}</NativeSelectOption>
                                            <NativeSelectOption value="exclude">{t("cueSequence.roleOptions.exclude")}</NativeSelectOption>
                                        </NativeSelect>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <Separator/>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-foreground">{t("cueSequence.posesLabel", {count: cues.length})}</p>
                            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={addCue}>
                                <PiPlus className="size-4"/> {t("cueSequence.addPose")}
                            </Button>
                        </div>

                        {cues.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                {t("cueSequence.noPosesYet")}
                            </p>
                        ) : null}

                        {cues.map((cue, idx) => (
                            <div key={cue.id} className="space-y-2 rounded-md border bg-background/50 p-2">
                                <div className="flex items-center gap-2">
                                    <Input
                                        aria-label={t("cueSequence.poseLabelAria", {index: idx + 1})}
                                        value={cue.label ?? ""}
                                        placeholder={t("cueSequence.poseFallback", {index: idx + 1})}
                                        disabled={busy}
                                        onChange={(e) => setCueLabel(idx, e.target.value)}
                                        className="h-8"
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy || idx === 0}
                                        onClick={() => moveCue(idx, -1)}
                                        aria-label={t("cueSequence.movePoseUp")}
                                    >
                                        <PiArrowUp className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy || idx === cues.length - 1}
                                        onClick={() => moveCue(idx, 1)}
                                        aria-label={t("cueSequence.movePoseDown")}
                                    >
                                        <PiArrowDown className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => removeCue(idx)}
                                        aria-label={t("cueSequence.removePose")}
                                    >
                                        <PiTrash className="size-4"/>
                                    </Button>
                                </div>

                                {poseChannels.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        {t("cueSequence.markPoseChannel")}
                                    </p>
                                ) : (
                                    <div className="grid gap-2">
                                        {poseChannels.map((ch) => {
                                            const key = channelKey(ch);
                                            const v = clampByte(cue.values?.[key] ?? defaultValueFor(ch));
                                            return (
                                                <label
                                                    key={`${cue.id}-${key}`}
                                                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                                                >
                                                    <span className="font-medium text-foreground">
                                                        {t("cueSequence.offsetChannelValueLabel", {offset: ch.channel, type: ch.type, value: v})}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Slider
                                                            min={0}
                                                            max={255}
                                                            step={1}
                                                            value={[v]}
                                                            disabled={busy}
                                                            onValueChange={([nv]) => setCueValue(idx, key, nv ?? 0)}
                                                        />
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={255}
                                                            value={v}
                                                            disabled={busy}
                                                            onChange={(e) => setCueValue(idx, key, Number(e.target.value) || 0)}
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

import {useCallback, useState} from "react";
import {PiArrowDown, PiArrowUp, PiFloppyDisk, PiMagicWand, PiPencilSimple, PiTrash} from "react-icons/pi";

import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Checkbox} from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {cn} from "@/lib/utils";
import type {DMXFixture, DMXFixturePreset, DMXFixturePresetSequence} from "@/types/controller.ts";
import {fixtureSupportsMovingHeadShow, generateMovingHeadShow} from "@/lib/movingHeadPresetShow.ts";

export type DMXFixturePresetManagerProps = {
    fixture: DMXFixture;
    sequence: DMXFixturePresetSequence | undefined;
    /** Captures the current live channel values as fixture-relative offset → 0–255. */
    captureValues: () => Record<string, number>;
    /** Persists the updated sequence; returns true on success. */
    onSave: (next: DMXFixturePresetSequence) => Promise<boolean>;
    /** Recalls a preset into the live controls (sets the fixture to that static position). */
    onApplyPreset?: (preset: DMXFixturePreset) => void;
    /** Whether recalling a preset to live output is currently possible. */
    canApply?: boolean;
    /** ID of the preset most recently applied to live; used to highlight it. */
    activePresetId?: string | null;
    busy?: boolean;
};

function newPresetId(): string {
    return `preset-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

type DialogState =
    | {mode: "create"; name: string}
    | {mode: "rename"; name: string; presetId: string}
    | null;

export function DMXFixturePresetManager(props: DMXFixturePresetManagerProps) {
    const {fixture, sequence, captureValues, onSave, onApplyPreset, canApply, activePresetId, busy} = props;

    const presets = sequence?.presets ?? [];
    const enabled = !!sequence?.enabled;
    const loop = sequence?.loop ?? true;
    const idlePresetId = sequence?.idlePresetId ?? "";
    const stepMs = typeof sequence?.stepMs === "number" && sequence.stepMs > 0 ? sequence.stepMs : 2000;
    const fadeMs = typeof sequence?.fadeMs === "number" && sequence.fadeMs >= 0 ? sequence.fadeMs : 0;

    const [dialog, setDialog] = useState<DialogState>(null);
    const [saving, setSaving] = useState(false);

    const disabled = !!busy || saving;

    const persist = useCallback(
        async (next: DMXFixturePresetSequence) => {
            setSaving(true);
            try {
                return await onSave(next);
            } finally {
                setSaving(false);
            }
        },
        [onSave],
    );

    const baseSequence = useCallback(
        (): DMXFixturePresetSequence => ({
            enabled,
            loop,
            stepMs,
            fadeMs,
            presets,
            ...(idlePresetId ? {idlePresetId} : {}),
            ...(sequence?.channelBehaviors ? {channelBehaviors: sequence.channelBehaviors} : {}),
        }),
        [enabled, fadeMs, idlePresetId, loop, presets, sequence?.channelBehaviors, stepMs],
    );

    const confirmDialog = useCallback(async () => {
        if (!dialog) return;
        const label = dialog.name.trim();
        if (dialog.mode === "create") {
            const preset: DMXFixturePreset = {
                id: newPresetId(),
                label: label || `Pose ${presets.length + 1}`,
                values: captureValues(),
            };
            const next = baseSequence();
            // Turn the chase on automatically when the first pose is captured.
            const ok = await persist({...next, enabled: presets.length === 0 ? true : next.enabled, presets: [...presets, preset]});
            if (ok) setDialog(null);
            return;
        }
        const next = baseSequence();
        const ok = await persist({
            ...next,
            presets: presets.map((p) => (p.id === dialog.presetId ? {...p, label} : p)),
        });
        if (ok) setDialog(null);
    }, [baseSequence, captureValues, dialog, persist, presets]);

    const updateFromLive = useCallback(
        (presetId: string) => {
            const next = baseSequence();
            void persist({
                ...next,
                presets: presets.map((p) => (p.id === presetId ? {...p, values: captureValues()} : p)),
            });
        },
        [baseSequence, captureValues, persist, presets],
    );

    const removePreset = useCallback(
        (presetId: string) => {
            const next = baseSequence();
            const remaining = presets.filter((p) => p.id !== presetId);
            void persist({...next, presets: remaining, enabled: remaining.length === 0 ? false : next.enabled});
        },
        [baseSequence, persist, presets],
    );

    const movePreset = useCallback(
        (idx: number, dir: -1 | 1) => {
            const target = idx + dir;
            if (target < 0 || target >= presets.length) return;
            const reordered = [...presets];
            [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
            void persist({...baseSequence(), presets: reordered});
        },
        [baseSequence, persist, presets],
    );

    const setPresetTiming = useCallback(
        (presetId: string, patch: {holdMs?: number; fadeMs?: number}) => {
            void persist({
                ...baseSequence(),
                presets: presets.map((p) => (p.id === presetId ? {...p, ...patch} : p)),
            });
        },
        [baseSequence, persist, presets],
    );

    const setEnabled = useCallback(
        (on: boolean) => {
            void persist({...baseSequence(), enabled: on});
        },
        [baseSequence, persist],
    );

    const setTiming = useCallback(
        (patch: {stepMs?: number; fadeMs?: number}) => {
            void persist({...baseSequence(), ...patch});
        },
        [baseSequence, persist],
    );

    const setLoop = useCallback(
        (on: boolean) => {
            void persist({...baseSequence(), loop: on});
        },
        [baseSequence, persist],
    );

    const setIdlePreset = useCallback(
        (id: string) => {
            void persist({...baseSequence(), idlePresetId: id});
        },
        [baseSequence, persist],
    );

    const generateShow = useCallback(() => {
        const generated = generateMovingHeadShow(fixture);
        if (generated.length === 0) {
            return;
        }
        const next = baseSequence();
        void persist({
            ...next,
            enabled: true,
            presets: [...presets, ...generated],
            // Seed sensible chase timing for a fresh sequence; keep the user's when appending.
            stepMs: presets.length > 0 ? next.stepMs : 3000,
            fadeMs: presets.length > 0 ? next.fadeMs : 800,
        });
    }, [baseSequence, fixture, persist, presets]);

    const canGenerateShow = fixtureSupportsMovingHeadShow(fixture);

    return (
        <Card>
            <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-sm font-semibold">Show presets</p>
                        <p className="text-xs text-muted-foreground">
                            Move the fixture above, then capture its current position as a pose.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {canGenerateShow && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={disabled}
                                onClick={generateShow}
                                title="Add 10 ready-made moving-head poses (home, sweeps, crosses, sky, floor, diagonals)"
                            >
                                <PiMagicWand className="size-4"/> Generate show
                            </Button>
                        )}
                        <Button
                            type="button"
                            size="sm"
                            disabled={disabled}
                            onClick={() => setDialog({mode: "create", name: ""})}
                        >
                            <PiFloppyDisk className="size-4"/> Save as preset
                        </Button>
                    </div>
                </div>

                {presets.length > 0 ? (
                    <>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={enabled}
                                disabled={disabled}
                                onCheckedChange={(v) => setEnabled(v === true)}
                            />
                            <span>Play these presets in party mode (preset chase)</span>
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={loop}
                                disabled={disabled}
                                onCheckedChange={(v) => setLoop(v === true)}
                            />
                            <span>Loop — restart from the first pose after the last (otherwise hold the final pose)</span>
                        </label>

                        <div className="space-y-1">
                            <Label htmlFor="preset-mgr-idle">Idle / startup position</Label>
                            <NativeSelect
                                id="preset-mgr-idle"
                                value={idlePresetId}
                                disabled={disabled}
                                onChange={(e) => setIdlePreset(e.target.value)}
                            >
                                <NativeSelectOption value="">None (channel defaults)</NativeSelectOption>
                                {presets.map((p, i) => (
                                    <NativeSelectOption key={p.id} value={p.id}>
                                        {p.label || `Pose ${i + 1}`}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                            <p className="text-xs text-muted-foreground">
                                Applied automatically when live output starts, so the fixture rests in this position
                                when no party is running.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="preset-mgr-step">Default time per pose (ms)</Label>
                                <Input
                                    id="preset-mgr-step"
                                    type="number"
                                    min={100}
                                    max={600000}
                                    step={100}
                                    value={stepMs}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        setTiming({stepMs: Math.max(100, Math.min(600000, Math.round(Number(e.target.value) || 2000)))})
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="preset-mgr-fade">Default crossfade (ms)</Label>
                                <Input
                                    id="preset-mgr-fade"
                                    type="number"
                                    min={0}
                                    max={Math.min(600000, stepMs)}
                                    step={50}
                                    value={fadeMs}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        setTiming({fadeMs: Math.max(0, Math.min(stepMs, Math.round(Number(e.target.value) || 0)))})
                                    }
                                />
                            </div>
                        </div>

                        <Separator/>

                        <p className="text-xs text-muted-foreground">
                            Reorder with the arrows to set how poses play through the show. Set a pose's Hold/Fade to
                            vary its timing (0 = use the defaults above).
                        </p>
                        {onApplyPreset && (
                            <p className="text-xs text-muted-foreground">
                                Shortcuts: press <kbd className="rounded border bg-muted px-1">1</kbd>–<kbd className="rounded border bg-muted px-1">9</kbd> / <kbd className="rounded border bg-muted px-1">0</kbd> to recall presets 1–10, or <kbd className="rounded border bg-muted px-1">Shift</kbd>+<kbd className="rounded border bg-muted px-1">↑</kbd>/<kbd className="rounded border bg-muted px-1">↓</kbd> to step.
                            </p>
                        )}
                        <ol className="space-y-1.5">
                            {presets.map((preset, idx) => (
                                <li
                                    key={preset.id}
                                    className={cn(
                                        "flex flex-col gap-1.5 rounded-md border bg-background/50 px-2 py-1.5",
                                        activePresetId === preset.id && "border-primary ring-1 ring-primary/40 bg-primary/5",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                                        {idx + 1}
                                    </span>
                                    {onApplyPreset && idx < 10 && (
                                        <kbd
                                            className="hidden shrink-0 rounded border bg-muted px-1 text-[10px] font-semibold text-muted-foreground sm:inline-block"
                                            title={`Press ${idx === 9 ? 0 : idx + 1} to recall this preset`}
                                        >
                                            {idx === 9 ? 0 : idx + 1}
                                        </kbd>
                                    )}
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                        {preset.label || `Pose ${idx + 1}`}
                                    </span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled || idx === 0}
                                        onClick={() => movePreset(idx, -1)}
                                        aria-label="Move preset up"
                                    >
                                        <PiArrowUp className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled || idx === presets.length - 1}
                                        onClick={() => movePreset(idx, 1)}
                                        aria-label="Move preset down"
                                    >
                                        <PiArrowDown className="size-4"/>
                                    </Button>
                                    {onApplyPreset && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={disabled || !canApply}
                                            onClick={() => onApplyPreset(preset)}
                                            title={
                                                canApply
                                                    ? "Move the fixture to this position now"
                                                    : "Connect live output (and stop party) to apply"
                                            }
                                        >
                                            Apply
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() => updateFromLive(preset.id)}
                                        title="Overwrite this preset with the current live position"
                                    >
                                        Update from live
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled}
                                        onClick={() => setDialog({mode: "rename", name: preset.label ?? "", presetId: preset.id})}
                                        aria-label="Rename preset"
                                    >
                                        <PiPencilSimple className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled}
                                        onClick={() => removePreset(preset.id)}
                                        aria-label="Delete preset"
                                    >
                                        <PiTrash className="size-4"/>
                                    </Button>
                                    </div>
                                    <div className="flex items-center gap-3 pl-7 text-xs text-muted-foreground">
                                        <label className="flex items-center gap-1">
                                            <span>Hold</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={600000}
                                                step={100}
                                                value={preset.holdMs ?? 0}
                                                disabled={disabled}
                                                onChange={(e) =>
                                                    setPresetTiming(preset.id, {
                                                        holdMs: Math.max(0, Math.min(600000, Math.round(Number(e.target.value) || 0))),
                                                    })
                                                }
                                                className="h-7 w-20"
                                            />
                                            <span>ms</span>
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span>Fade</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={600000}
                                                step={50}
                                                value={preset.fadeMs ?? 0}
                                                disabled={disabled}
                                                onChange={(e) =>
                                                    setPresetTiming(preset.id, {
                                                        fadeMs: Math.max(0, Math.min(600000, Math.round(Number(e.target.value) || 0))),
                                                    })
                                                }
                                                className="h-7 w-20"
                                            />
                                            <span>ms</span>
                                        </label>
                                        <span className="text-[11px] opacity-70">0 = use default</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        No presets yet. Position the fixture, then “Save as preset” to capture it.
                    </p>
                )}
            </CardContent>

            <Dialog open={dialog !== null} onOpenChange={(open) => (!open ? setDialog(null) : undefined)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{dialog?.mode === "rename" ? "Rename preset" : "Save preset"}</DialogTitle>
                        <DialogDescription>
                            {dialog?.mode === "rename"
                                ? "Give this preset a new name."
                                : "Capture the fixture's current position as a named preset."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="preset-name">Preset name</Label>
                        <Input
                            id="preset-name"
                            autoFocus
                            value={dialog?.name ?? ""}
                            placeholder={`Pose ${presets.length + 1}`}
                            disabled={saving}
                            onChange={(e) => setDialog((d) => (d ? {...d, name: e.target.value} : d))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void confirmDialog();
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={saving} onClick={() => setDialog(null)}>
                            Cancel
                        </Button>
                        <Button type="button" disabled={saving} onClick={() => void confirmDialog()}>
                            {dialog?.mode === "rename" ? "Save name" : "Save preset"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

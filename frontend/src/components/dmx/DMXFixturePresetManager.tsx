import {useCallback, useState} from "react";
import {PiArrowDown, PiArrowUp, PiFloppyDisk, PiPencilSimple, PiTrash} from "react-icons/pi";

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
import type {DMXFixturePreset, DMXFixturePresetSequence} from "@/types/controller.ts";

export type DMXFixturePresetManagerProps = {
    sequence: DMXFixturePresetSequence | undefined;
    /** Captures the current live channel values as fixture-relative offset → 0–255. */
    captureValues: () => Record<string, number>;
    /** Persists the updated sequence; returns true on success. */
    onSave: (next: DMXFixturePresetSequence) => Promise<boolean>;
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
    const {sequence, captureValues, onSave, busy} = props;

    const presets = sequence?.presets ?? [];
    const enabled = !!sequence?.enabled;
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
            stepMs,
            fadeMs,
            presets,
            ...(sequence?.channelBehaviors ? {channelBehaviors: sequence.channelBehaviors} : {}),
        }),
        [enabled, fadeMs, presets, sequence?.channelBehaviors, stepMs],
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
                    <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setDialog({mode: "create", name: ""})}
                    >
                        <PiFloppyDisk className="size-4"/> Save as preset
                    </Button>
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

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="preset-mgr-step">Time per pose (ms)</Label>
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
                                <Label htmlFor="preset-mgr-fade">Crossfade (ms)</Label>
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
                            Drag order with the arrows to set how poses play through the show.
                        </p>
                        <ol className="space-y-1.5">
                            {presets.map((preset, idx) => (
                                <li
                                    key={preset.id}
                                    className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5"
                                >
                                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                                        {idx + 1}
                                    </span>
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

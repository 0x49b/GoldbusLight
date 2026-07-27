import {useCallback, useState} from "react";
import {useTranslation} from "react-i18next";
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
import type {DMXFixture, DMXFixtureCue, DMXFixtureCueSequence} from "@/types/controller.ts";
import {fixtureSupportsMovingHeadShow, generateMovingHeadShow} from "@/lib/movingHeadCueShow.ts";

export type DMXFixtureCueManagerProps = {
    fixture: DMXFixture;
    sequence: DMXFixtureCueSequence | undefined;
    /** Captures the current live channel values as fixture-relative offset → 0–255. */
    captureValues: () => Record<string, number>;
    /** Persists the updated sequence; returns true on success. */
    onSave: (next: DMXFixtureCueSequence) => Promise<boolean>;
    /** Recalls a cue into the live controls (sets the fixture to that static position). */
    onApplyCue?: (cue: DMXFixtureCue) => void;
    /** Whether recalling a cue to live output is currently possible. */
    canApply?: boolean;
    /** ID of the cue most recently applied to live; used to highlight it. */
    activeCueId?: string | null;
    busy?: boolean;
    /** Party cues include chase/idle controls; scene cues are static poses only. */
    mode?: "party" | "scene";
};

function newCueId(): string {
    return `cue-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

type DialogState =
    | {mode: "create"; name: string}
    | {mode: "rename"; name: string; cueId: string}
    | null;

export function DMXFixtureCueManager(props: DMXFixtureCueManagerProps) {
    const {fixture, sequence, captureValues, onSave, onApplyCue, canApply, activeCueId, busy, mode = "party"} = props;
    const {t} = useTranslation("dmx");
    const isSceneMode = mode === "scene";

    const cues = sequence?.cues ?? [];
    const enabled = !!sequence?.enabled;
    const loop = sequence?.loop ?? true;
    const idleCueId = sequence?.idleCueId ?? "";
    const stepMs = typeof sequence?.stepMs === "number" && sequence.stepMs > 0 ? sequence.stepMs : 2000;
    const fadeMs = typeof sequence?.fadeMs === "number" && sequence.fadeMs >= 0 ? sequence.fadeMs : 0;

    const [dialog, setDialog] = useState<DialogState>(null);
    const [saving, setSaving] = useState(false);

    const disabled = !!busy || saving;

    const persist = useCallback(
        async (next: DMXFixtureCueSequence) => {
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
        (): DMXFixtureCueSequence => ({
            enabled,
            loop,
            stepMs,
            fadeMs,
            cues,
            ...(idleCueId ? {idleCueId} : {}),
            ...(sequence?.channelBehaviors ? {channelBehaviors: sequence.channelBehaviors} : {}),
        }),
        [enabled, fadeMs, idleCueId, loop, cues, sequence?.channelBehaviors, stepMs],
    );

    const confirmDialog = useCallback(async () => {
        if (!dialog) return;
        const label = dialog.name.trim();
        if (dialog.mode === "create") {
            const cue: DMXFixtureCue = {
                id: newCueId(),
                label: label || t("cues.poseFallback", {index: cues.length + 1}),
                values: captureValues(),
            };
            const next = baseSequence();
            // Turn the chase on automatically when the first pose is captured.
            const ok = await persist({...next, enabled: cues.length === 0 ? true : next.enabled, cues: [...cues, cue]});
            if (ok) setDialog(null);
            return;
        }
        const next = baseSequence();
        const ok = await persist({
            ...next,
            cues: cues.map((p) => (p.id === dialog.cueId ? {...p, label} : p)),
        });
        if (ok) setDialog(null);
    }, [baseSequence, captureValues, dialog, persist, cues, t]);

    const updateFromLive = useCallback(
        (cueId: string) => {
            const next = baseSequence();
            void persist({
                ...next,
                cues: cues.map((p) => (p.id === cueId ? {...p, values: captureValues()} : p)),
            });
        },
        [baseSequence, captureValues, persist, cues],
    );

    const removeCue = useCallback(
        (cueId: string) => {
            const next = baseSequence();
            const remaining = cues.filter((p) => p.id !== cueId);
            void persist({...next, cues: remaining, enabled: remaining.length === 0 ? false : next.enabled});
        },
        [baseSequence, persist, cues],
    );

    const moveCue = useCallback(
        (idx: number, dir: -1 | 1) => {
            const target = idx + dir;
            if (target < 0 || target >= cues.length) return;
            const reordered = [...cues];
            [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
            void persist({...baseSequence(), cues: reordered});
        },
        [baseSequence, persist, cues],
    );

    const setCueTiming = useCallback(
        (cueId: string, patch: {holdMs?: number; fadeMs?: number}) => {
            void persist({
                ...baseSequence(),
                cues: cues.map((p) => (p.id === cueId ? {...p, ...patch} : p)),
            });
        },
        [baseSequence, persist, cues],
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

    const setIdleCue = useCallback(
        (id: string) => {
            void persist({...baseSequence(), idleCueId: id});
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
            cues: [...cues, ...generated],
            // Seed sensible chase timing for a fresh sequence; keep the user's when appending.
            stepMs: cues.length > 0 ? next.stepMs : 3000,
            fadeMs: cues.length > 0 ? next.fadeMs : 800,
        });
    }, [baseSequence, fixture, persist, cues]);

    const canGenerateShow = fixtureSupportsMovingHeadShow(fixture);

    return (
        <Card>
            <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-sm font-semibold">{isSceneMode ? t("cues.sceneTitle") : t("cues.showTitle")}</p>
                        <p className="text-xs text-muted-foreground">
                            {isSceneMode ? t("cues.sceneDescription") : t("cues.showDescription")}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {!isSceneMode && canGenerateShow && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={disabled}
                                onClick={generateShow}
                                title={t("cues.generateShowTooltip")}
                            >
                                <PiMagicWand className="size-4"/> {t("cues.generateShow")}
                            </Button>
                        )}
                        <Button
                            type="button"
                            size="sm"
                            disabled={disabled}
                            onClick={() => setDialog({mode: "create", name: ""})}
                        >
                            <PiFloppyDisk className="size-4"/> {t("cues.createFromLive")}
                        </Button>
                    </div>
                </div>

                {cues.length > 0 ? (
                    <>
                        {!isSceneMode && (
                            <>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={enabled}
                                disabled={disabled}
                                onCheckedChange={(v) => setEnabled(v === true)}
                            />
                            <span>{t("cues.playInParty")}</span>
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={loop}
                                disabled={disabled}
                                onCheckedChange={(v) => setLoop(v === true)}
                            />
                            <span>{t("cues.loop")}</span>
                        </label>

                        <div className="space-y-1">
                            <Label htmlFor="cue-mgr-idle">{t("cues.idleLabel")}</Label>
                            <NativeSelect
                                id="cue-mgr-idle"
                                value={idleCueId}
                                disabled={disabled}
                                onChange={(e) => setIdleCue(e.target.value)}
                            >
                                <NativeSelectOption value="">{t("cues.idleNone")}</NativeSelectOption>
                                {cues.map((p, i) => (
                                    <NativeSelectOption key={p.id} value={p.id}>
                                        {p.label || t("cues.poseFallback", {index: i + 1})}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                            <p className="text-xs text-muted-foreground">
                                {t("cues.idleHint")}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="cue-mgr-step">{t("cues.defaultTimePerPose")}</Label>
                                <Input
                                    id="cue-mgr-step"
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
                                <Label htmlFor="cue-mgr-fade">{t("cues.defaultCrossfade")}</Label>
                                <Input
                                    id="cue-mgr-fade"
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
                            {t("cues.reorderHint")}
                        </p>
                            </>
                        )}
                        {onApplyCue && (
                            <p className="text-xs text-muted-foreground">
                                {t("cues.shortcutsBefore")} <kbd className="rounded border bg-muted px-1">1</kbd>–<kbd className="rounded border bg-muted px-1">9</kbd> / <kbd className="rounded border bg-muted px-1">0</kbd> {t("cues.shortcutsToRecall")} <kbd className="rounded border bg-muted px-1">Shift</kbd>+<kbd className="rounded border bg-muted px-1">↑</kbd>/<kbd className="rounded border bg-muted px-1">↓</kbd> {t("cues.shortcutsToStep")}
                            </p>
                        )}
                        <ol className="space-y-1.5">
                            {cues.map((cue, idx) => (
                                <li
                                    key={cue.id}
                                    className={cn(
                                        "flex flex-col gap-1.5 rounded-md border bg-background/50 px-2 py-1.5",
                                        activeCueId === cue.id && "border-primary ring-1 ring-primary/40 bg-primary/5",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                                        {idx + 1}
                                    </span>
                                    {onApplyCue && idx < 10 && (
                                        <kbd
                                            className="hidden shrink-0 rounded border bg-muted px-1 text-[10px] font-semibold text-muted-foreground sm:inline-block"
                                            title={t("cues.recallHint", {key: idx === 9 ? 0 : idx + 1})}
                                        >
                                            {idx === 9 ? 0 : idx + 1}
                                        </kbd>
                                    )}
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                        {cue.label || t("cues.poseFallback", {index: idx + 1})}
                                    </span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled || idx === 0}
                                        onClick={() => moveCue(idx, -1)}
                                        aria-label={t("cues.moveCueUp")}
                                    >
                                        <PiArrowUp className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled || idx === cues.length - 1}
                                        onClick={() => moveCue(idx, 1)}
                                        aria-label={t("cues.moveCueDown")}
                                    >
                                        <PiArrowDown className="size-4"/>
                                    </Button>
                                    {onApplyCue && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={disabled || !canApply}
                                            onClick={() => onApplyCue(cue)}
                                            title={canApply ? t("cues.applyEnabled") : t("cues.applyDisabled")}
                                        >
                                            {t("cues.apply")}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() => updateFromLive(cue.id)}
                                        title={t("cues.updateFromLiveTitle")}
                                    >
                                        {t("cues.updateFromLive")}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled}
                                        onClick={() => setDialog({mode: "rename", name: cue.label ?? "", cueId: cue.id})}
                                        aria-label={t("cues.renameCue")}
                                    >
                                        <PiPencilSimple className="size-4"/>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={disabled}
                                        onClick={() => removeCue(cue.id)}
                                        aria-label={t("cues.deleteCue")}
                                    >
                                        <PiTrash className="size-4"/>
                                    </Button>
                                    </div>
                                    <div className="flex items-center gap-3 pl-7 text-xs text-muted-foreground">
                                        <label className="flex items-center gap-1">
                                            <span>{t("cues.hold")}</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={600000}
                                                step={100}
                                                value={cue.holdMs ?? 0}
                                                disabled={disabled}
                                                onChange={(e) =>
                                                    setCueTiming(cue.id, {
                                                        holdMs: Math.max(0, Math.min(600000, Math.round(Number(e.target.value) || 0))),
                                                    })
                                                }
                                                className="h-7 w-20"
                                            />
                                            <span>{t("cues.ms")}</span>
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <span>{t("cues.fade")}</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={600000}
                                                step={50}
                                                value={cue.fadeMs ?? 0}
                                                disabled={disabled}
                                                onChange={(e) =>
                                                    setCueTiming(cue.id, {
                                                        fadeMs: Math.max(0, Math.min(600000, Math.round(Number(e.target.value) || 0))),
                                                    })
                                                }
                                                className="h-7 w-20"
                                            />
                                            <span>{t("cues.ms")}</span>
                                        </label>
                                        <span className="text-[11px] opacity-70">{t("cues.zeroUseDefault")}</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {t("cues.noCuesYet")}
                    </p>
                )}
            </CardContent>

            <Dialog open={dialog !== null} onOpenChange={(open) => (!open ? setDialog(null) : undefined)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{dialog?.mode === "rename" ? t("cues.dialog.renameTitle") : t("cues.dialog.createTitle")}</DialogTitle>
                        <DialogDescription>
                            {dialog?.mode === "rename" ? t("cues.dialog.renameDesc") : t("cues.dialog.createDesc")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="cue-name">{t("cues.dialog.cueName")}</Label>
                        <Input
                            id="cue-name"
                            autoFocus
                            value={dialog?.name ?? ""}
                            placeholder={t("cues.poseFallback", {index: cues.length + 1})}
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
                            {t("cues.dialog.cancel")}
                        </Button>
                        <Button type="button" disabled={saving} onClick={() => void confirmDialog()}>
                            {dialog?.mode === "rename" ? t("cues.dialog.saveName") : t("cues.dialog.saveCue")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

import {useEffect, useMemo, useState} from "react";
import {PiArrowLeft, PiGearSix, PiPlus, PiTrash, PiWarning} from "react-icons/pi";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {TransferList} from "@/components/scenes/TransferList";
import type {
    DMXFixture,
    LightingScene,
    SceneDMXEntry,
    SceneWLEDEntry,
    UpsertLightingSceneInput,
    WLEDDevice,
} from "@/types/controller";
import {cn} from "@/lib/utils";

type ScenesViewProps = {
    scenes: LightingScene[];
    activeSceneId?: string;
    defaultSceneId?: string;
    devices: WLEDDevice[];
    fixtures: DMXFixture[];
    wledEnabled: boolean;
    dmxEnabled: boolean;
    /** True when a USB/Art-Net/simulator output is configured for DMX. */
    dmxInterfaceConfigured: boolean;
    busy: boolean;
    onApply: (id: string) => Promise<void>;
    onCreate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onUpdate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onDelete: (id: string) => Promise<void>;
    onExport: (id: string) => Promise<string>;
    onImport: () => Promise<LightingScene | null>;
    onSetDefault: (id: string) => Promise<void>;
    onOpenSettings?: () => void;
};

type SceneDraft = {
    id: string;
    name: string;
    wledDeviceIds: string[];
    dmxFixtureIds: string[];
    wledPresetByDevice: Record<string, string>;
    dmxCueByFixture: Record<string, string>;
};

function emptyDraft(): SceneDraft {
    return {
        id: "",
        name: "",
        wledDeviceIds: [],
        dmxFixtureIds: [],
        wledPresetByDevice: {},
        dmxCueByFixture: {},
    };
}

function draftFromScene(scene: LightingScene): SceneDraft {
    const wled = scene.wled ?? [];
    const dmx = scene.dmx ?? [];
    return {
        id: scene.id,
        name: scene.name,
        wledDeviceIds: wled.map((e) => e.deviceId),
        dmxFixtureIds: dmx.map((e) => e.fixtureId),
        wledPresetByDevice: Object.fromEntries(wled.map((e) => [e.deviceId, e.presetId])),
        dmxCueByFixture: Object.fromEntries(dmx.map((e) => [e.fixtureId, e.cueId])),
    };
}

function draftToInput(draft: SceneDraft): UpsertLightingSceneInput {
    const wled: SceneWLEDEntry[] = draft.wledDeviceIds
        .map((deviceId) => ({
            deviceId,
            presetId: draft.wledPresetByDevice[deviceId] ?? "",
        }))
        .filter((e) => e.presetId);
    const dmx: SceneDMXEntry[] = draft.dmxFixtureIds
        .map((fixtureId) => ({
            fixtureId,
            cueId: draft.dmxCueByFixture[fixtureId] ?? "",
        }))
        .filter((e) => e.cueId);
    return {
        id: draft.id || undefined,
        name: draft.name.trim(),
        wled,
        dmx,
    };
}

export function ScenesView({
    scenes,
    activeSceneId,
    defaultSceneId,
    devices,
    fixtures,
    wledEnabled,
    dmxEnabled,
    dmxInterfaceConfigured,
    busy,
    onApply,
    onCreate,
    onUpdate,
    onDelete,
    onExport,
    onImport,
    onSetDefault,
    onOpenSettings,
}: ScenesViewProps) {
    const [managing, setManaging] = useState(false);
    const [draft, setDraft] = useState<SceneDraft>(emptyDraft);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [defaultReplaceOpen, setDefaultReplaceOpen] = useState(false);
    const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);

    const sortedScenes = useMemo(
        () => [...scenes].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"})),
        [scenes],
    );

    const currentDefaultScene = useMemo(
        () => scenes.find((s) => s.id === defaultSceneId) ?? null,
        [scenes, defaultSceneId],
    );

    const wledItems = useMemo(
        () =>
            devices
                .filter((d) => !d.ignored)
                .map((d) => ({
                    id: d.id,
                    label: d.name || d.host || d.id,
                    hint: d.online ? "Online" : "Offline",
                })),
        [devices],
    );

    const dmxItems = useMemo(
        () =>
            fixtures.map((fx) => {
                const cueCount = fx.sceneCues?.length ?? 0;
                return {
                    id: fx.id,
                    label: [fx.brand, fx.name].filter(Boolean).join(" ") || fx.id,
                    hint: cueCount > 0 ? `${cueCount} scene cue${cueCount === 1 ? "" : "s"}` : "No scene cues",
                };
            }),
        [fixtures],
    );

    const requestSetDefault = (nextId: string) => {
        if (!nextId) {
            void onSetDefault("");
            return;
        }
        if (defaultSceneId && defaultSceneId !== nextId) {
            setPendingDefaultId(nextId);
            setDefaultReplaceOpen(true);
            return;
        }
        void onSetDefault(nextId);
    };

    const confirmReplaceDefault = () => {
        if (!pendingDefaultId) {
            setDefaultReplaceOpen(false);
            return;
        }
        const id = pendingDefaultId;
        setPendingDefaultId(null);
        setDefaultReplaceOpen(false);
        void onSetDefault(id);
    };

    useEffect(() => {
        if (!draft.id) {
            return;
        }
        const stillThere = scenes.some((s) => s.id === draft.id);
        if (!stillThere) {
            setDraft(emptyDraft());
        }
    }, [scenes, draft.id]);

    const openManage = (scene?: LightingScene) => {
        setDraft(scene ? draftFromScene(scene) : emptyDraft());
        setManaging(true);
    };

    const leaveManage = () => {
        setManaging(false);
        setDraft(emptyDraft());
    };

    const saveDraft = async () => {
        const input = draftToInput(draft);
        if (!input.name) {
            return;
        }
        setSaving(true);
        try {
            if (draft.id) {
                const updated = await onUpdate({...input, id: draft.id});
                setDraft(draftFromScene(updated));
            } else {
                const created = await onCreate(input);
                setDraft(draftFromScene(created));
            }
        } finally {
            setSaving(false);
        }
    };

    const deleteSelected = async () => {
        if (!draft.id) {
            return;
        }
        setSaving(true);
        try {
            await onDelete(draft.id);
            setDraft(emptyDraft());
        } finally {
            setSaving(false);
        }
    };

    if (managing) {
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="-ml-2 gap-1 px-2"
                            onClick={leaveManage}
                        >
                            <PiArrowLeft className="size-4" aria-hidden />
                            Back to scenes
                        </Button>
                        <h1 className="text-xl font-semibold tracking-tight">Manage scenes</h1>
                        <p className="text-sm text-muted-foreground">
                            Create and edit looks across WLED presets and DMX scene cues.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => setDraft(emptyDraft())} disabled={busy || saving}>
                            <PiPlus className="size-4" aria-hidden />
                            Create scene
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy || saving}
                            onClick={() => {
                                void onImport().then((scene) => {
                                    if (scene) {
                                        setDraft(draftFromScene(scene));
                                    }
                                });
                            }}
                        >
                            Import
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy || saving || !draft.id}
                            onClick={() => {
                                if (draft.id) {
                                    void onExport(draft.id);
                                }
                            }}
                        >
                            Export
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy || saving || !draft.id}
                            onClick={() => {
                                void deleteSelected();
                            }}
                        >
                            <PiTrash className="size-4" aria-hidden />
                            Delete
                        </Button>
                    </div>
                </div>

                {dmxEnabled && !dmxInterfaceConfigured ? (
                    <Alert>
                        <PiWarning className="size-4" aria-hidden />
                        <AlertTitle>No DMX interface configured</AlertTitle>
                        <AlertDescription className="space-y-2">
                            <p>
                                Scenes that include DMX fixtures need a working output. Open Settings → DMX, enable USB
                                DMX and/or Art-Net, then select a USB device or Art-Net target (or turn on a simulator for
                                testing).
                            </p>
                            {onOpenSettings ? (
                                <Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
                                    Open DMX settings
                                </Button>
                            ) : null}
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Scenes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 p-2">
                            {sortedScenes.length === 0 ? (
                                <p className="px-2 py-3 text-xs text-muted-foreground">No scenes yet</p>
                            ) : (
                                sortedScenes.map((scene) => (
                                    <button
                                        key={scene.id}
                                        type="button"
                                        className={cn(
                                            "w-full rounded-md px-2 py-1.5 text-left text-sm",
                                            draft.id === scene.id ? "bg-accent font-medium" : "hover:bg-muted/60",
                                        )}
                                        onClick={() => setDraft(draftFromScene(scene))}
                                    >
                                        {scene.name}
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                            <CardTitle className="text-base">{draft.id ? "Edit scene" : "New scene"}</CardTitle>
                            <Button
                                type="button"
                                size="sm"
                                disabled={busy || saving || !draft.name.trim()}
                                onClick={() => {
                                    void saveDraft();
                                }}
                            >
                                {draft.id ? "Save scene" : "Create scene"}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="scene-name">Name</Label>
                                <Input
                                    id="scene-name"
                                    value={draft.name}
                                    disabled={busy || saving}
                                    onChange={(e) => setDraft((prev) => ({...prev, name: e.target.value}))}
                                    placeholder="Lobby warm"
                                />
                            </div>

                            {draft.id ? (
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={defaultSceneId === draft.id}
                                        disabled={busy || saving}
                                        onCheckedChange={(checked) => {
                                            requestSetDefault(checked === true ? draft.id : "");
                                        }}
                                    />
                                    <span>Apply this scene when the app starts</span>
                                </label>
                            ) : null}

                            {wledEnabled ? (
                                <div className="space-y-3">
                                    <Label>WLED devices</Label>
                                    <TransferList
                                        items={wledItems}
                                        includedIds={draft.wledDeviceIds}
                                        disabled={busy || saving}
                                        onChange={(ids) => {
                                            setDraft((prev) => {
                                                const nextPresets = {...prev.wledPresetByDevice};
                                                for (const id of ids) {
                                                    if (!nextPresets[id]) {
                                                        const device = devices.find((d) => d.id === id);
                                                        nextPresets[id] = device?.presets?.[0]?.id ?? "";
                                                    }
                                                }
                                                for (const key of Object.keys(nextPresets)) {
                                                    if (!ids.includes(key)) {
                                                        delete nextPresets[key];
                                                    }
                                                }
                                                return {
                                                    ...prev,
                                                    wledDeviceIds: ids,
                                                    wledPresetByDevice: nextPresets,
                                                };
                                            });
                                        }}
                                    />
                                    {draft.wledDeviceIds.map((deviceId) => {
                                        const device = devices.find((d) => d.id === deviceId);
                                        const presets = device?.presets ?? [];
                                        return (
                                            <div
                                                key={deviceId}
                                                className="grid gap-2 sm:grid-cols-[1fr_220px] sm:items-center"
                                            >
                                                <div className="text-sm font-medium">{device?.name || deviceId}</div>
                                                <Select
                                                    value={draft.wledPresetByDevice[deviceId] || undefined}
                                                    disabled={busy || saving || presets.length === 0}
                                                    onValueChange={(value) => {
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            wledPresetByDevice: {
                                                                ...prev.wledPresetByDevice,
                                                                [deviceId]: value,
                                                            },
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue
                                                            placeholder={
                                                                presets.length === 0
                                                                    ? "No presets on device"
                                                                    : "Select preset"
                                                            }
                                                        />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {presets.map((preset) => (
                                                            <SelectItem key={preset.id} value={preset.id}>
                                                                {preset.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}

                            {dmxEnabled ? (
                                <div className="space-y-3">
                                    <Label>DMX fixtures</Label>
                                    <TransferList
                                        items={dmxItems}
                                        includedIds={draft.dmxFixtureIds}
                                        disabled={busy || saving}
                                        onChange={(ids) => {
                                            setDraft((prev) => {
                                                const nextCues = {...prev.dmxCueByFixture};
                                                for (const id of ids) {
                                                    if (!nextCues[id]) {
                                                        const fixture = fixtures.find((fx) => fx.id === id);
                                                        nextCues[id] = fixture?.sceneCues?.[0]?.id ?? "";
                                                    }
                                                }
                                                for (const key of Object.keys(nextCues)) {
                                                    if (!ids.includes(key)) {
                                                        delete nextCues[key];
                                                    }
                                                }
                                                return {
                                                    ...prev,
                                                    dmxFixtureIds: ids,
                                                    dmxCueByFixture: nextCues,
                                                };
                                            });
                                        }}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Scenes use each fixture&apos;s Scene cues (not Party cues). Add them on the
                                        fixture page under Scene cues.
                                    </p>
                                    {draft.dmxFixtureIds.map((fixtureId) => {
                                        const fixture = fixtures.find((fx) => fx.id === fixtureId);
                                        const cues = fixture?.sceneCues ?? [];
                                        return (
                                            <div
                                                key={fixtureId}
                                                className="grid gap-2 sm:grid-cols-[1fr_220px] sm:items-center"
                                            >
                                                <div className="text-sm font-medium">
                                                    {[fixture?.brand, fixture?.name].filter(Boolean).join(" ") ||
                                                        fixtureId}
                                                </div>
                                                <Select
                                                    value={draft.dmxCueByFixture[fixtureId] || undefined}
                                                    disabled={busy || saving || cues.length === 0}
                                                    onValueChange={(value) => {
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            dmxCueByFixture: {
                                                                ...prev.dmxCueByFixture,
                                                                [fixtureId]: value,
                                                            },
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue
                                                            placeholder={
                                                                cues.length === 0
                                                                    ? "No scene cues"
                                                                    : "Select scene cue"
                                                            }
                                                        />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {cues.map((cue) => (
                                                            <SelectItem key={cue.id} value={cue.id}>
                                                                {cue.label || cue.id}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                <Dialog
                    open={defaultReplaceOpen}
                    onOpenChange={(open) => {
                        setDefaultReplaceOpen(open);
                        if (!open) {
                            setPendingDefaultId(null);
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Replace default scene?</DialogTitle>
                            <DialogDescription>
                                Only one scene can be the startup default.
                                {currentDefaultScene
                                    ? ` “${currentDefaultScene.name}” is currently the default. Make this scene the new default instead?`
                                    : " Another scene is already marked as default. Continue?"}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setPendingDefaultId(null);
                                    setDefaultReplaceOpen(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="button" onClick={confirmReplaceDefault}>
                                Replace default
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Scenes</h1>
                    <p className="text-sm text-muted-foreground">Tap a scene to apply it.</p>
                </div>
                <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => openManage()}>
                    <PiGearSix className="size-4" aria-hidden />
                    Manage
                </Button>
            </div>

            {dmxEnabled && !dmxInterfaceConfigured ? (
                <Alert>
                    <PiWarning className="size-4" aria-hidden />
                    <AlertTitle>No DMX interface configured</AlertTitle>
                    <AlertDescription className="space-y-2">
                        <p>
                            Scenes that include DMX fixtures need a working output. Open Settings → DMX, enable USB
                            DMX and/or Art-Net, then select a USB device or Art-Net target (or turn on a simulator for
                            testing).
                        </p>
                        {onOpenSettings ? (
                            <Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
                                Open DMX settings
                            </Button>
                        ) : null}
                    </AlertDescription>
                </Alert>
            ) : null}

            {sortedScenes.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-start gap-3 py-8">
                        <p className="text-sm text-muted-foreground">No scenes yet. Create one to get started.</p>
                        <Button type="button" size="sm" onClick={() => openManage()}>
                            <PiPlus className="size-4" aria-hidden />
                            Create scene
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedScenes.map((scene) => {
                        const wledCount = scene.wled?.length ?? 0;
                        const dmxCount = scene.dmx?.length ?? 0;
                        const isApplying = applyingId === scene.id;
                        const isActive = activeSceneId === scene.id;
                        const isDefault = defaultSceneId === scene.id;
                        return (
                            <button
                                key={scene.id}
                                type="button"
                                disabled={busy || isApplying}
                                aria-pressed={isActive}
                                className={cn(
                                    "rounded-lg border bg-card p-4 text-left shadow-sm transition",
                                    "hover:border-foreground/30 hover:bg-accent/40",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    "disabled:opacity-60",
                                    isActive && "border-primary bg-primary/10 ring-2 ring-primary/40",
                                )}
                                onClick={() => {
                                    setApplyingId(scene.id);
                                    void onApply(scene.id).finally(() => setApplyingId(null));
                                }}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-lg font-semibold">{scene.name}</div>
                                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                        {isDefault ? (
                                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Default
                                            </span>
                                        ) : null}
                                        {isActive ? (
                                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                                                Active
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                    {wledCount} WLED · {dmxCount} DMX
                                    {isApplying ? " · Applying…" : ""}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

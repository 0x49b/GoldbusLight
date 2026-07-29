import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {PiArrowLeft, PiPlus, PiTrash, PiWarning} from "react-icons/pi";
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
import {PartyTargetsPicker} from "@/components/settings/components/party/PartyTargetsPicker";
import type {
    DMXFixture,
    LightingScene,
    SceneDMXEntry,
    SceneWLEDEntry,
    UpsertLightingSceneInput,
    WLEDDevice,
} from "@/types/controller";
import {cn} from "@/lib/utils";

type SceneDraft = {
    id: string;
    name: string;
    partyMode: boolean;
    wledDeviceIds: string[];
    dmxFixtureIds: string[];
    wledPresetByDevice: Record<string, string>;
    dmxCueByFixture: Record<string, string>;
    partyWledDeviceIds: string[];
    partyFixtureIds: string[];
};

function emptyDraft(): SceneDraft {
    return {
        id: "",
        name: "",
        partyMode: false,
        wledDeviceIds: [],
        dmxFixtureIds: [],
        wledPresetByDevice: {},
        dmxCueByFixture: {},
        partyWledDeviceIds: [],
        partyFixtureIds: [],
    };
}

function draftFromScene(scene: LightingScene, partySceneId?: string): SceneDraft {
    const wled = scene.wled ?? [];
    const dmx = scene.dmx ?? [];
    return {
        id: scene.id,
        name: scene.name,
        partyMode: partySceneId === scene.id,
        wledDeviceIds: wled.map((e) => e.deviceId),
        dmxFixtureIds: dmx.map((e) => e.fixtureId),
        wledPresetByDevice: Object.fromEntries(wled.map((e) => [e.deviceId, e.presetId])),
        dmxCueByFixture: Object.fromEntries(dmx.map((e) => [e.fixtureId, e.cueId])),
        partyWledDeviceIds: scene.partyWledDeviceIds ?? [],
        partyFixtureIds: scene.partyFixtureIds ?? [],
    };
}

function draftToInput(draft: SceneDraft): UpsertLightingSceneInput {
    const wled: SceneWLEDEntry[] = draft.partyMode
        ? []
        : draft.wledDeviceIds
              .map((deviceId) => ({
                  deviceId,
                  presetId: draft.wledPresetByDevice[deviceId] ?? "",
              }))
              .filter((e) => e.presetId);
    const dmx: SceneDMXEntry[] = draft.partyMode
        ? []
        : draft.dmxFixtureIds
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
        partyWledDeviceIds: draft.partyMode ? draft.partyWledDeviceIds : [],
        partyFixtureIds: draft.partyMode ? draft.partyFixtureIds : [],
    };
}

export type ScenesEditorProps = {
    scenes: LightingScene[];
    defaultSceneId?: string;
    partySceneId?: string;
    devices: WLEDDevice[];
    fixtures: DMXFixture[];
    wledEnabled: boolean;
    dmxEnabled: boolean;
    /** True when a USB/Art-Net/simulator output is configured for DMX. */
    dmxInterfaceConfigured: boolean;
    busy: boolean;
    onCreate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onUpdate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onDelete: (id: string) => Promise<void>;
    onExport: (id: string) => Promise<string>;
    onImport: () => Promise<LightingScene | null>;
    onSetDefault: (id: string) => Promise<void>;
    onSetPartyScene: (id: string) => Promise<void>;
    onOpenSettings?: () => void;
    onBack: () => void;
};

export function ScenesEditor({
    scenes,
    defaultSceneId,
    partySceneId,
    devices,
    fixtures,
    wledEnabled,
    dmxEnabled,
    dmxInterfaceConfigured,
    busy,
    onCreate,
    onUpdate,
    onDelete,
    onExport,
    onImport,
    onSetDefault,
    onSetPartyScene,
    onOpenSettings,
    onBack,
}: Readonly<ScenesEditorProps>) {
    const {t} = useTranslation("scenes");
    const [draft, setDraft] = useState<SceneDraft>(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [defaultReplaceOpen, setDefaultReplaceOpen] = useState(false);
    const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);
    const [partyReplaceOpen, setPartyReplaceOpen] = useState(false);

    const sortedScenes = useMemo(
        () => [...scenes].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"})),
        [scenes],
    );

    const currentDefaultScene = useMemo(
        () => scenes.find((s) => s.id === defaultSceneId) ?? null,
        [scenes, defaultSceneId],
    );

    const currentPartyScene = useMemo(
        () => scenes.find((s) => s.id === partySceneId) ?? null,
        [scenes, partySceneId],
    );

    const partyWledDevices = useMemo(
        () => devices.filter((device) => !device.ignored),
        [devices],
    );

    const wledItems = useMemo(
        () =>
            devices
                .filter((d) => !d.ignored)
                .map((d) => ({
                    id: d.id,
                    label: d.name || d.host || d.id,
                    hint: d.online ? t("editor.wledOnline") : t("editor.wledOffline"),
                })),
        [devices, t],
    );

    const dmxItems = useMemo(
        () =>
            fixtures.map((fx) => {
                const cueCount = fx.sceneCues?.length ?? 0;
                return {
                    id: fx.id,
                    label: [fx.brand, fx.name].filter(Boolean).join(" ") || fx.id,
                    hint: cueCount > 0 ? t("editor.cueCount", {count: cueCount}) : t("editor.cueCountNone"),
                };
            }),
        [fixtures, t],
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

    const applyPartyMode = (enabled: boolean) => {
        setDraft((prev) => ({...prev, partyMode: enabled}));
    };

    const requestPartyMode = (enabled: boolean) => {
        if (!enabled) {
            applyPartyMode(false);
            return;
        }
        if (draft.id && partySceneId && partySceneId !== draft.id) {
            setPartyReplaceOpen(true);
            return;
        }
        applyPartyMode(true);
    };

    const confirmReplaceParty = () => {
        setPartyReplaceOpen(false);
        applyPartyMode(true);
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

    const saveDraft = async () => {
        const input = draftToInput(draft);
        if (!input.name) {
            return;
        }
        setSaving(true);
        try {
            let sceneId = draft.id;
            if (draft.id) {
                const updated = await onUpdate({...input, id: draft.id});
                sceneId = updated.id;
                setDraft(draftFromScene(updated, draft.partyMode ? sceneId : partySceneId));
            } else {
                const created = await onCreate(input);
                sceneId = created.id;
                setDraft(draftFromScene(created, draft.partyMode ? sceneId : partySceneId));
            }
            if (draft.partyMode && sceneId) {
                if (partySceneId !== sceneId) {
                    await onSetPartyScene(sceneId);
                }
            } else if (!draft.partyMode && partySceneId === sceneId) {
                await onSetPartyScene("");
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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 gap-1 px-2"
                        onClick={onBack}
                    >
                        <PiArrowLeft className="size-4" aria-hidden />
                        {t("editor.back")}
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={() => setDraft(emptyDraft())} disabled={busy || saving}>
                        <PiPlus className="size-4" aria-hidden />
                        {t("editor.createScene")}
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
                        {t("editor.import")}
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
                        {t("editor.export")}
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
                        {t("editor.delete")}
                    </Button>
                </div>
            </div>

            {dmxEnabled && !dmxInterfaceConfigured ? (
                <Alert>
                    <PiWarning className="size-4" aria-hidden />
                    <AlertTitle>{t("noDmxInterface.title")}</AlertTitle>
                    <AlertDescription className="space-y-2">
                        <p>{t("noDmxInterface.description")}</p>
                        {onOpenSettings ? (
                            <Button type="button" size="sm" variant="secondary" onClick={onOpenSettings}>
                                {t("noDmxInterface.openSettings")}
                            </Button>
                        ) : null}
                    </AlertDescription>
                </Alert>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle>{t("editor.listTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 p-2">
                        {sortedScenes.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-muted-foreground">{t("editor.listEmpty")}</p>
                        ) : (
                            sortedScenes.map((scene) => (
                                <button
                                    key={scene.id}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-md px-2 py-1.5 text-left text-sm",
                                        draft.id === scene.id ? "bg-accent font-medium" : "hover:bg-muted/60",
                                    )}
                                    onClick={() => setDraft(draftFromScene(scene, partySceneId))}
                                >
                                    {scene.name}
                                </button>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                        <CardTitle className="text-base">{draft.id ? t("editor.editTitle") : t("editor.newTitle")}</CardTitle>
                        <Button
                            type="button"
                            size="sm"
                            disabled={busy || saving || !draft.name.trim()}
                            onClick={() => {
                                void saveDraft();
                            }}
                        >
                            {draft.id ? t("editor.saveScene") : t("editor.createScene")}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="scene-name">{t("editor.name")}</Label>
                            <Input
                                id="scene-name"
                                value={draft.name}
                                disabled={busy || saving}
                                onChange={(e) => setDraft((prev) => ({...prev, name: e.target.value}))}
                                placeholder={t("editor.namePlaceholder")}
                            />
                        </div>

                        {draft.id ? (
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={defaultSceneId === draft.id}
                                    disabled={busy || saving || draft.partyMode}
                                    onCheckedChange={(checked) => {
                                        requestSetDefault(checked === true ? draft.id : "");
                                    }}
                                />
                                <span>{t("editor.defaultOnStart")}</span>
                            </label>
                        ) : null}

                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={draft.partyMode}
                                disabled={busy || saving}
                                onCheckedChange={(checked) => {
                                    requestPartyMode(checked === true);
                                }}
                            />
                            <span>{t("editor.partyMode")}</span>
                        </label>

                        {draft.partyMode ? (
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label>{t("editor.partyTargets")}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("editor.partyTargetsHint")}
                                    </p>
                                </div>
                                <PartyTargetsPicker
                                    wledDevices={partyWledDevices}
                                    fixtures={fixtures}
                                    selectedWledIds={draft.partyWledDeviceIds}
                                    selectedFixtureIds={draft.partyFixtureIds}
                                    disabled={busy || saving}
                                    onChangeWledIds={(ids) => {
                                        setDraft((prev) => ({...prev, partyWledDeviceIds: ids}));
                                    }}
                                    onChangeFixtureIds={(ids) => {
                                        setDraft((prev) => ({...prev, partyFixtureIds: ids}));
                                    }}
                                />
                            </div>
                        ) : null}

                        {!draft.partyMode && wledEnabled ? (
                            <div className="space-y-3">
                                <Label>{t("editor.wledDevices")}</Label>
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
                                                                ? t("editor.noPresets")
                                                                : t("editor.selectPreset")
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

                        {!draft.partyMode && dmxEnabled ? (
                            <div className="space-y-3">
                                <Label>{t("editor.dmxFixtures")}</Label>
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
                                    {t("editor.sceneCuesHint")}
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
                                                                ? t("editor.noSceneCues")
                                                                : t("editor.selectSceneCue")
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
                        <DialogTitle>{t("replaceDefault.title")}</DialogTitle>
                        <DialogDescription>
                            {currentDefaultScene
                                ? t("replaceDefault.bodyWithCurrent", {name: currentDefaultScene.name})
                                : t("replaceDefault.bodyGeneric")}
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
                            {t("replaceDefault.cancel")}
                        </Button>
                        <Button type="button" onClick={confirmReplaceDefault}>
                            {t("replaceDefault.confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={partyReplaceOpen}
                onOpenChange={(open) => {
                    setPartyReplaceOpen(open);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("replaceParty.title")}</DialogTitle>
                        <DialogDescription>
                            {currentPartyScene
                                ? t("replaceParty.bodyWithCurrent", {name: currentPartyScene.name})
                                : t("replaceParty.bodyGeneric")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setPartyReplaceOpen(false);
                            }}
                        >
                            {t("replaceParty.cancel")}
                        </Button>
                        <Button type="button" onClick={confirmReplaceParty}>
                            {t("replaceParty.confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

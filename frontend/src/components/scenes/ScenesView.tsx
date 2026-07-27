import {useMemo, useState} from "react";
import {PiGearSix, PiPlus, PiWarning} from "react-icons/pi";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {ScenesEditor} from "@/components/scenes/ScenesEditor";
import {DMXEmergencyButton} from "@/components/dmx/DMXEmergencyButton";
import {DMXOutputIndicator} from "@/components/dmx/DMXOutputIndicator";
import type {
    DMXFixture,
    LightingScene,
    UpsertLightingSceneInput,
    WLEDDevice,
} from "@/types/controller";
import {cn} from "@/lib/utils";

type ScenesViewProps = {
    scenes: LightingScene[];
    activeSceneId?: string;
    defaultSceneId?: string;
    partySceneId?: string;
    partyRunning?: boolean;
    devices: WLEDDevice[];
    fixtures: DMXFixture[];
    wledEnabled: boolean;
    dmxEnabled: boolean;
    /** True when a USB/Art-Net/simulator output is configured for DMX. */
    dmxInterfaceConfigured: boolean;
    /** True when the app is currently sending DMX packets to an attached interface. */
    dmxLiveConnected?: boolean;
    busy: boolean;
    onApply: (id: string) => Promise<void>;
    onStartParty: () => Promise<void>;
    onCreate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onUpdate: (input: UpsertLightingSceneInput) => Promise<LightingScene>;
    onDelete: (id: string) => Promise<void>;
    onExport: (id: string) => Promise<string>;
    onImport: () => Promise<LightingScene | null>;
    onSetDefault: (id: string) => Promise<void>;
    onSetPartyScene: (id: string) => Promise<void>;
    onOpenSettings?: () => void;
    onEmergency: () => void | Promise<void>;
};

export function ScenesView({
    scenes,
    activeSceneId,
    defaultSceneId,
    partySceneId,
    partyRunning = false,
    devices,
    fixtures,
    wledEnabled,
    dmxEnabled,
    dmxInterfaceConfigured,
    dmxLiveConnected = false,
    busy,
    onApply,
    onStartParty,
    onCreate,
    onUpdate,
    onDelete,
    onExport,
    onImport,
    onSetDefault,
    onSetPartyScene,
    onOpenSettings,
    onEmergency,
}: ScenesViewProps) {
    const [managing, setManaging] = useState(false);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [startingParty, setStartingParty] = useState(false);
    const [pendingActivateId, setPendingActivateId] = useState<string | null>(null);

    const sortedScenes = useMemo(
        () => [...scenes].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"})),
        [scenes],
    );

    const pendingActivateScene = useMemo(
        () => scenes.find((s) => s.id === pendingActivateId) ?? null,
        [scenes, pendingActivateId],
    );

    const pendingActivateIsParty = pendingActivateId != null && pendingActivateId === partySceneId;

    const requestActivateScene = (scene: LightingScene) => {
        const isPartyScene = partySceneId === scene.id;
        if (isPartyScene) {
            if (partyRunning || startingParty) {
                return;
            }
        } else if (activeSceneId === scene.id || applyingId === scene.id) {
            return;
        }
        setPendingActivateId(scene.id);
    };

    const confirmActivateScene = () => {
        const id = pendingActivateId;
        if (!id) {
            setPendingActivateId(null);
            return;
        }
        const isPartyScene = partySceneId === id;
        setPendingActivateId(null);
        if (isPartyScene) {
            setStartingParty(true);
            void onStartParty().finally(() => setStartingParty(false));
            return;
        }
        setApplyingId(id);
        void onApply(id).finally(() => setApplyingId(null));
    };

    if (managing) {
        return (
            <ScenesEditor
                scenes={scenes}
                defaultSceneId={defaultSceneId}
                partySceneId={partySceneId}
                devices={devices}
                fixtures={fixtures}
                wledEnabled={wledEnabled}
                dmxEnabled={dmxEnabled}
                dmxInterfaceConfigured={dmxInterfaceConfigured}
                busy={busy}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onExport={onExport}
                onImport={onImport}
                onSetDefault={onSetDefault}
                onSetPartyScene={onSetPartyScene}
                onOpenSettings={onOpenSettings}
                onBack={() => setManaging(false)}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Scenes</h1>
                    <p className="text-sm text-muted-foreground">Tap a scene to switch to it.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => setManaging(true)}>
                        <PiGearSix className="size-4" aria-hidden />
                        Manage
                    </Button>
                    {dmxEnabled ? <DMXEmergencyButton busy={busy} onEmergency={onEmergency}/> : null}
                    {dmxEnabled ? <DMXOutputIndicator connected={dmxLiveConnected}/> : null}
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

            {sortedScenes.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-start gap-3 py-8">
                        <p className="text-sm text-muted-foreground">No scenes yet. Create one to get started.</p>
                        <Button type="button" size="sm" onClick={() => setManaging(true)}>
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
                        const partyWledCount = scene.partyWledDeviceIds?.length ?? 0;
                        const partyDmxCount = scene.partyFixtureIds?.length ?? 0;
                        const isApplying = applyingId === scene.id;
                        const isActive = activeSceneId === scene.id;
                        const isDefault = defaultSceneId === scene.id;
                        const isPartyScene = partySceneId === scene.id;
                        const isPartyActive = isPartyScene && partyRunning;
                        const isBusyActivating = isApplying || (isPartyScene && startingParty);
                        const isCurrent = isPartyScene ? isPartyActive : isActive;
                        const disabled =
                            busy || isBusyActivating || isCurrent || applyingId != null || startingParty;
                        return (
                            <button
                                key={scene.id}
                                type="button"
                                disabled={disabled}
                                aria-pressed={isCurrent}
                                onClick={() => requestActivateScene(scene)}
                                className={cn(
                                    "flex flex-col overflow-hidden rounded-xl bg-card p-4 text-left text-sm text-card-foreground ring-1 ring-foreground/10 transition",
                                    "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    "border-1",
                                    isActive && !isPartyScene && "border-primary ring-primary/40",
                                    isPartyActive && "border-violet-500 ring-2 ring-violet-500/40",
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-lg font-semibold">{scene.name}</div>
                                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                        {isCurrent ? (
                                            <span
                                                className={cn(
                                                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                                    isPartyScene
                                                        ? "bg-violet-600 text-white"
                                                        : "bg-primary text-primary-foreground",
                                                )}
                                            >
                                                Active
                                            </span>
                                        ) : null}
                                        {isPartyScene ? (
                                            <span className="rounded-full border border-violet-500/50 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                                                Party
                                            </span>
                                        ) : null}
                                        {isDefault ? (
                                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Default
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                    {isPartyScene
                                        ? `${partyWledCount} WLED · ${partyDmxCount} DMX party targets`
                                        : `${wledCount} WLED · ${dmxCount} DMX`}
                                    {isApplying ? " · Applying…" : ""}
                                    {isPartyScene && startingParty ? " · Starting…" : ""}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <Dialog
                open={pendingActivateId != null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingActivateId(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {pendingActivateIsParty ? "Start party mode?" : "Switch scene?"}
                        </DialogTitle>
                        <DialogDescription>
                            {pendingActivateIsParty
                                ? `Start party mode using “${pendingActivateScene?.name ?? "this scene"}”? This will stop any currently applied scene.`
                                : `Switch to “${pendingActivateScene?.name ?? "this scene"}”?${
                                      partyRunning ? " Party mode will be stopped." : ""
                                  }`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setPendingActivateId(null)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={confirmActivateScene}>
                            {pendingActivateIsParty ? "Start party" : "Switch scene"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

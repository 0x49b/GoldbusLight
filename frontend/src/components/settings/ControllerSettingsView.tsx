import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {type Dispatch, type SetStateAction, useCallback, useEffect, useRef} from "react";
import type {
    ArtNetSettings,
    ConsoleEntry,
    ControllerSettings,
    ControllerSnapshot,
    DMXPartyAudioInputDevice,
    DMXPartyConfig,
    DMXPartyState,
    DMXState,
    NetworkApplyResult,
    SettingsTab,
    USBSerialDevice,
    WLEDDevice,
} from "@/types/controller.ts";
import {universeInterfaceSettings} from "@/lib/dmxUniverses";
import {ConsoleSettingsTab} from "./tabs/ConsoleSettingsTab.tsx";
import {DmxSettingsTab} from "./tabs/DmxSettingsTab.tsx";
import {GeneralSettingsTab} from "./tabs/GeneralSettingsTab.tsx";
import {PartySettingsTab} from "./tabs/PartySettingsTab.tsx";
import type {SettingsUpdateMode, SettingsUpdater} from "./settingsTypes";
import {WledSettingsTab} from "./tabs/WledSettingsTab.tsx";

export type ControllerSettingsViewProps = {
    settings: ControllerSettings | null;
    setSettings: Dispatch<SetStateAction<ControllerSettings | null>>;
    snapshot: ControllerSnapshot | null;
    applyResult: NetworkApplyResult | null;
    statePayloadText: string;
    setStatePayloadText: Dispatch<SetStateAction<string>>;
    configPatchText: string;
    setConfigPatchText: Dispatch<SetStateAction<string>>;
    ignoredDevices: WLEDDevice[];
    busy: boolean;
    onSaveSettings: () => Promise<boolean>;
    onSettingsInteraction: (holdMs?: number) => void;
    onApplyNetwork: () => void;
    onUnignoreDevice: (deviceId: string) => void;
    currentVersion: string;
    updatesSupported: boolean;
    dmxState: DMXState;
    dmxEnabled: boolean;
    wledEnabled: boolean;
    dmxPartyRunning: boolean;
    party: DMXPartyState;
    partyWledDevices: WLEDDevice[];
    partyAudioInputDevices: DMXPartyAudioInputDevice[];
    onRefreshPartyAudioDevices: () => Promise<void>;
    onUpdatePartyConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    onStartParty: () => Promise<boolean>;
    onStopParty: () => Promise<void>;
    initialTab?: SettingsTab;
    startDMXLiveOutput: (fixtureId: string) => Promise<boolean>;
    setError: (message: string) => void;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string, universeId?: string) => void;
    onRefreshSnapshot: () => void;
    consoleEntries: ConsoleEntry[];
    onClearConsole: () => void;
    consoleDetached: boolean;
    onToggleConsoleDetach: () => void;
    onExportConfigurationBackup: () => Promise<string>;
    onImportConfigurationBackup: () => Promise<string>;
    onCheckForUpdates: () => Promise<void>;
};

export function ControllerSettingsView({
    settings,
    setSettings,
    snapshot,
    applyResult,
    statePayloadText,
    setStatePayloadText,
    configPatchText,
    setConfigPatchText,
    ignoredDevices,
    busy,
    onSaveSettings,
    onSettingsInteraction,
    onApplyNetwork,
    onUnignoreDevice,
    currentVersion,
    updatesSupported,
    dmxState,
    dmxEnabled,
    wledEnabled,
    dmxPartyRunning,
    party,
    partyWledDevices,
    partyAudioInputDevices,
    onRefreshPartyAudioDevices,
    onUpdatePartyConfig,
    onStartParty,
    onStopParty,
    initialTab = "general",
    startDMXLiveOutput,
    setError,
    usbSerialDevices,
    onRefreshUSBSerialDevices,
    onSelectUSBSerialDevice,
    onRefreshSnapshot,
    consoleEntries,
    onClearConsole,
    consoleDetached,
    onToggleConsoleDetach,
    onExportConfigurationBackup,
    onImportConfigurationBackup,
    onCheckForUpdates,
}: Readonly<ControllerSettingsViewProps>) {
    const saveTimerRef = useRef<number | null>(null);
    const AUTOSAVE_IDLE_MS = 2000;

    const flushAutosaveNow = useCallback(() => {
        onSettingsInteraction(3000);
        if (saveTimerRef.current != null) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        void onSaveSettings();
    }, [onSaveSettings, onSettingsInteraction]);

    const scheduleAutosave = useCallback(() => {
        onSettingsInteraction(5000);
        if (saveTimerRef.current != null) {
            window.clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            void onSaveSettings();
        }, AUTOSAVE_IDLE_MS);
    }, [onSaveSettings, onSettingsInteraction]);

    const updateSettings: SettingsUpdater = useCallback(
        (updater, mode: SettingsUpdateMode = "debounced") => {
            setSettings(updater);
            if (mode === "immediate") {
                flushAutosaveNow();
                return;
            }
            scheduleAutosave();
        },
        [flushAutosaveNow, scheduleAutosave, setSettings],
    );

    const updateStatePayloadText = useCallback((text: string) => {
        setStatePayloadText(text);
        scheduleAutosave();
    }, [scheduleAutosave, setStatePayloadText]);

    const updateConfigPatchText = useCallback((text: string) => {
        setConfigPatchText(text);
        scheduleAutosave();
    }, [scheduleAutosave, setConfigPatchText]);

    const updateUniverseArtNet = useCallback((
        _universeId: string,
        patch: Partial<ArtNetSettings>,
        mode: SettingsUpdateMode = "debounced",
    ) => {
        updateSettings((prev) => {
            if (!prev) {
                return prev;
            }
            const current = universeInterfaceSettings(prev, "universe-1", dmxState);
            return {
                ...prev,
                dmx: {
                    ...prev.dmx,
                    universeInterfaces: {
                        "universe-1": {
                            ...current,
                            artNet: {...current.artNet, ...patch},
                        },
                    },
                },
            };
        }, mode);
    }, [dmxState, updateSettings]);

    const disableAccessPointNow = useCallback(async () => {
        setSettings((previous) => {
            if (!previous) {
                return previous;
            }
            return {
                ...previous,
                accessPoint: {
                    ...previous.accessPoint,
                    enabled: false,
                },
            };
        });
        const saved = await onSaveSettings();
        if (saved) {
            onApplyNetwork();
        }
    }, [onApplyNetwork, onSaveSettings, setSettings]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current != null) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, []);

    if (!settings) {
        return <p className="opacity-70">Loading settings…</p>;
    }

    return (
        <div className="flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden">
            <Tabs
                key={`${consoleDetached ? "console-detached" : "console-attached"}-${initialTab}`}
                defaultValue={initialTab === "console" && consoleDetached ? "general" : initialTab}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            >
                <div className="shrink-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">Settings</h2>
                    </div>
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="wled">WLED</TabsTrigger>
                        <TabsTrigger value="dmx">DMX</TabsTrigger>
                        {(wledEnabled || dmxEnabled) && <TabsTrigger value="party">Party</TabsTrigger>}
                        {!consoleDetached && <TabsTrigger value="console">Console</TabsTrigger>}
                    </TabsList>
                </div>

                <div className="touch-pan-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-px pt-0.5 pb-8">
                    <TabsContent value="general">
                        <GeneralSettingsTab
                            applyResult={applyResult}
                            busy={busy}
                            currentVersion={currentVersion}
                            updatesSupported={updatesSupported}
                            onExportConfigurationBackup={onExportConfigurationBackup}
                            onImportConfigurationBackup={onImportConfigurationBackup}
                            onCheckForUpdates={onCheckForUpdates}
                            setError={setError}
                        />
                    </TabsContent>

                    <TabsContent value="wled">
                        <WledSettingsTab
                            settings={settings}
                            updateSettings={updateSettings}
                            flushAutosaveNow={flushAutosaveNow}
                            updateStatePayloadText={updateStatePayloadText}
                            updateConfigPatchText={updateConfigPatchText}
                            disableAccessPointNow={disableAccessPointNow}
                            busy={busy}
                            onApplyNetwork={onApplyNetwork}
                            onRefreshSnapshot={onRefreshSnapshot}
                            statePayloadText={statePayloadText}
                            configPatchText={configPatchText}
                            ignoredDevices={ignoredDevices}
                            onUnignoreDevice={onUnignoreDevice}
                        />
                    </TabsContent>

                    <TabsContent value="dmx">
                        <DmxSettingsTab
                            settings={settings}
                            updateSettings={updateSettings}
                            updateUniverseArtNet={updateUniverseArtNet}
                            flushAutosaveNow={flushAutosaveNow}
                            busy={busy}
                            dmxState={dmxState}
                            dmxEnabled={dmxEnabled}
                            dmxPartyRunning={dmxPartyRunning}
                            usbSerialDevices={usbSerialDevices}
                            onRefreshUSBSerialDevices={onRefreshUSBSerialDevices}
                            onSelectUSBSerialDevice={onSelectUSBSerialDevice}
                            startDMXLiveOutput={startDMXLiveOutput}
                            setError={setError}
                        />
                    </TabsContent>

                    {(wledEnabled || dmxEnabled) && (
                        <TabsContent value="party">
                            <PartySettingsTab
                                fixtures={dmxState.fixtures}
                                wledDevices={partyWledDevices}
                                party={party}
                                busy={busy}
                                audioInputDevices={partyAudioInputDevices}
                                onRefreshAudioDevices={onRefreshPartyAudioDevices}
                                onUpdateConfig={onUpdatePartyConfig}
                                onStart={onStartParty}
                                onStop={onStopParty}
                            />
                        </TabsContent>
                    )}

                    {!consoleDetached && (
                        <TabsContent value="console">
                            <ConsoleSettingsTab
                                entries={consoleEntries}
                                onClear={onClearConsole}
                                onToggleDetach={onToggleConsoleDetach}
                            />
                        </TabsContent>
                    )}

                    {snapshot && (
                        <p className="text-xs opacity-60">
                            Persistence: <code>{snapshot.persistencePath}</code> •
                            backend: {snapshot.capabilities.networkBackendLabel}
                            {" "}({snapshot.capabilities.networkBackendId}) • host
                            CLI: <code>{snapshot.capabilities.networkCliName || "—"}</code>
                            {snapshot.capabilities.networkControlAvailable ? "" : snapshot.capabilities.networkCliUnavailableReason && <> — <span
                                className="opacity-90">{snapshot.capabilities.networkCliUnavailableReason}</span></>}
                        </p>
                    )}
                </div>
            </Tabs>
        </div>
    );
}

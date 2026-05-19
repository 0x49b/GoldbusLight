import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { PiArrowsClockwise, PiBinoculars, PiWifiHigh } from "react-icons/pi";
import { prettyJSON, readNumber } from "../../lib/json";
import type {
    ConsoleEntry,
    ControllerSettings,
    ControllerSnapshot,
    DMXState,
    NetworkApplyResult,
    USBSerialDevice,
    WLEDDevice,
} from "@/types/controller.ts";
import { TransportConsolePanel } from "./TransportConsolePanel";

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
    dmxState: DMXState;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string) => void;
    onDiscoverNow: () => void;
    onRefreshSnapshot: () => void;
    consoleEntries: ConsoleEntry[];
    onClearConsole: () => void;
    consoleDetached: boolean;
    onToggleConsoleDetach: () => void;
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
                                           dmxState,
                                           usbSerialDevices,
                                           onRefreshUSBSerialDevices,
                                           onSelectUSBSerialDevice,
                                           onDiscoverNow,
                                           onRefreshSnapshot,
                                           consoleEntries,
                                           onClearConsole,
                                           consoleDetached,
                                           onToggleConsoleDetach,
                                       }: ControllerSettingsViewProps) {
    if (!settings) {
        return <p className="opacity-70">Loading settings…</p>;
    }

    const wledControlsDisabled = busy || !settings.wled.enabled;
    const dmxControlsDisabled = busy || !settings.dmx.enabled;
    const usbTransportEnabled = settings.dmx.usb.enabled ?? true;
    const usbFieldsDisabled = dmxControlsDisabled || !usbTransportEnabled;
    const artNetFieldsDisabled = dmxControlsDisabled || !settings.dmx.artNet.enabled;
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

    const updateSettings = useCallback(
        (
            updater: ControllerSettings | ((previous: ControllerSettings | null) => ControllerSettings | null),
            mode: "debounced" | "immediate" = "debounced",
        ) => {
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

    return (
        <div className="space-y-5 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Controller settings</h2>
            </div>

            <Tabs key={consoleDetached ? "console-detached" : "console-attached"} defaultValue="general">
                <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="wled">WLED</TabsTrigger>
                    <TabsTrigger value="dmx">DMX</TabsTrigger>
                    {!consoleDetached && <TabsTrigger value="console">Console</TabsTrigger>}
                </TabsList>

                <TabsContent value="general" className="space-y-5">
                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Application version</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm opacity-70">Running: <code>{currentVersion}</code></p>
                            <p className="text-xs opacity-60">
                                Updates are installed from the Pi shell with
                                <code> scripts/install-release.sh &lt;tag&gt;</code>.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Network apply result</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!applyResult && <p className="text-sm opacity-70">No apply action yet.</p>}
                            {applyResult && (
                                <div className="space-y-2">
                                    <p className="text-sm">
                                        {applyResult.dryRun ? "Dry-run (network CLI unavailable or unsupported)" : "Applied"}
                                    </p>
                                    {(applyResult.warnings ?? []).map((warning) => (
                                        <Alert key={warning} className="py-1 text-xs">
                                            <AlertDescription>{warning}</AlertDescription>
                                        </Alert>
                                    ))}
                                    <div className="max-h-48 overflow-auto rounded border p-2 bg-card">
                                        <pre className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="wled" className="space-y-5">
                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle>WLED component</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="flex items-center gap-3">
                                <Switch
                                    checked={settings.wled.enabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        wled: {...settings.wled, enabled: checked},
                                        accessPoint: {
                                            ...settings.accessPoint,
                                            enabled: checked ? settings.accessPoint.enabled : false
                                        }
                                    }, "immediate")}
                                    disabled={busy}
                                />
                                <span>Enable WLED component</span>
                            </label>
                            {!settings.wled.enabled && (
                                <p className="text-xs text-muted-foreground">
                                    WLED routes, menu entries, discovery, and device actions are disabled while this is off.
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onDiscoverNow}
                                    disabled={wledControlsDisabled}
                                    className="basis-32"
                                >
                                    <PiBinoculars/>
                                    Discover
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="basis-32"
                                    onClick={() => void onRefreshSnapshot()}
                                    disabled={busy}
                                >
                                    <PiArrowsClockwise/>
                                    Refresh
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Discover triggers a one-shot mDNS scan. Refresh pulls the latest controller snapshot from the backend.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                            <CardTitle>Access point</CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onApplyNetwork}
                                disabled={wledControlsDisabled}
                            >
                                <PiWifiHigh/> Apply network settings
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="flex items-center gap-3">
                                <Switch
                                    id="enable-ap"
                                    checked={settings.accessPoint.enabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        accessPoint: {...settings.accessPoint, enabled: checked}
                                    }, "immediate")}
                                    disabled={wledControlsDisabled}
                                />
                                <Label htmlFor="enable-ap">Enable local access point</Label>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void disableAccessPointNow()}
                                    disabled={wledControlsDisabled || !settings.accessPoint.enabled}
                                >
                                    Disable AP now (save + apply)
                                </Button>
                            </div>
                            {!settings.wled.enabled && (
                                <p className="text-xs text-muted-foreground">
                                    Access point is forced off while WLED component is disabled.
                                </p>
                            )}

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <Field>
                                    <FieldLabel htmlFor="ap-connection-name">AP connection name</FieldLabel>
                                    <Input
                                        id="ap-connection-name"
                                        type="text"
                                        value={settings.accessPoint.connection}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, connection: e.target.value}
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-interface">AP interface</FieldLabel>
                                    <Input
                                        id="ap-interface"
                                        type="text"
                                        value={settings.accessPoint.interfaceName}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, interfaceName: e.target.value}
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-ssid">AP SSID</FieldLabel>
                                    <Input
                                        id="ap-ssid"
                                        type="text"
                                        value={settings.accessPoint.ssid}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, ssid: e.target.value}
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-password">AP password</FieldLabel>
                                    <Input
                                        id="ap-password"
                                        type="text"
                                        value={settings.accessPoint.password}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, password: e.target.value}
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-channel">Channel</FieldLabel>
                                    <Input
                                        id="ap-channel"
                                        type="number"
                                        value={settings.accessPoint.channel}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            accessPoint: {
                                                ...settings.accessPoint,
                                                channel: readNumber(e.target.value, 6)
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Discovery & provisioning</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <label className="flex cursor-pointer justify-start gap-3 items-center">
                                <Switch
                                    checked={settings.wled.discovery.enabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {...settings.wled.discovery, enabled: checked}
                                        }
                                    }, "immediate")}
                                    disabled={wledControlsDisabled}
                                />
                                <span>Enable mDNS discovery loop</span>
                            </label>

                            <label className="flex cursor-pointer justify-start gap-3 items-center">
                                <Switch
                                    checked={settings.wled.testing.simulateWled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            testing: {...settings.wled.testing, simulateWled: checked}
                                        }
                                    }, "immediate")}
                                    disabled={wledControlsDisabled}
                                />
                                <span>Simulate WLED device (testing)</span>
                            </label>
                            <p className="text-xs opacity-60">
                                Adds an in-app fake device (<code className="font-mono text-[10px]">sim:wled</code>) with no network traffic.
                            </p>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <Input
                                    className="h-8"
                                    type="number"
                                    min={2}
                                    value={settings.wled.discovery.intervalSeconds}
                                    onChange={(e) => updateSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {
                                                ...settings.wled.discovery,
                                                intervalSeconds: readNumber(e.target.value, 15)
                                            }
                                        }
                                    })}
                                    onBlur={flushAutosaveNow}
                                    placeholder="Interval (s)"
                                    disabled={wledControlsDisabled}
                                />
                                <Input
                                    className="h-8"
                                    type="number"
                                    min={500}
                                    value={settings.wled.discovery.queryTimeoutMs}
                                    onChange={(e) => updateSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {
                                                ...settings.wled.discovery,
                                                queryTimeoutMs: readNumber(e.target.value, 2000)
                                            }
                                        }
                                    })}
                                    onBlur={flushAutosaveNow}
                                    placeholder="Query timeout ms"
                                    disabled={wledControlsDisabled}
                                />
                            </div>

                            <Input
                                className="h-8"
                                placeholder="Service types (comma separated)"
                                value={settings.wled.discovery.serviceTypes.join(",")}
                                onChange={(e) => updateSettings({
                                    ...settings,
                                    wled: {
                                        ...settings.wled,
                                        discovery: {
                                            ...settings.wled.discovery,
                                            serviceTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                                        }
                                    }
                                })}
                                onBlur={flushAutosaveNow}
                                disabled={wledControlsDisabled}
                            />

                            <label className="flex cursor-pointer justify-start gap-3 items-center">
                                <Switch
                                    checked={settings.wled.provisioning.autoProvision}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            provisioning: {...settings.wled.provisioning, autoProvision: checked}
                                        }
                                    }, "immediate")}
                                    disabled={wledControlsDisabled}
                                />
                                <span>Auto-provision newly discovered devices</span>
                            </label>

                            <div>
                                <Label className="py-0 text-xs">Default /json/state payload</Label>
                                <Textarea
                                    className="h-24 w-full font-mono text-xs"
                                    value={statePayloadText}
                                    onChange={(e) => updateStatePayloadText(e.target.value)}
                                    onBlur={flushAutosaveNow}
                                    disabled={wledControlsDisabled}
                                />
                            </div>

                            <div>
                                <Label className="py-0 text-xs">Default /json/cfg patch</Label>
                                <Textarea
                                    className="h-24 w-full font-mono text-xs"
                                    value={configPatchText}
                                    onChange={(e) => updateConfigPatchText(e.target.value)}
                                    onBlur={flushAutosaveNow}
                                    disabled={wledControlsDisabled}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Ignored devices</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm opacity-70">
                                Ignored devices stay out of the sidebar and presets but remain in
                                <code className="text-xs"> state.json</code>.
                            </p>
                            {ignoredDevices.length === 0 ? (
                                <p className="text-sm opacity-60">No ignored devices.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {ignoredDevices.map((dev) => (
                                        <li
                                            key={dev.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">{dev.name}</div>
                                                <div className="text-xs opacity-60 font-mono truncate">
                                                    {dev.address}:{dev.port} • {dev.id}
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="shrink-0"
                                                onClick={() => onUnignoreDevice(dev.id)}
                                                disabled={busy || !settings.wled.enabled}
                                            >
                                                Un-ignore
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="dmx" className="space-y-5">
                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle>DMX component</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="flex items-center gap-3">
                                <Switch
                                    checked={settings.dmx.enabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        dmx: {...settings.dmx, enabled: checked}
                                    }, "immediate")}
                                    disabled={busy}
                                />
                                <span>Enable DMX component</span>
                            </label>
                            {!settings.dmx.enabled && (
                                <p className="text-xs text-muted-foreground">
                                    DMX pages and menu entries are hidden, and live USB/Art-Net output is disconnected.
                                </p>
                            )}

                            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                                <p className="text-xs font-medium text-muted-foreground">DMX simulator interfaces</p>
                                <label className="flex items-center gap-3">
                                    <Switch
                                        checked={settings.dmx.testing.simulateUsbDmx}
                                        onCheckedChange={(checked) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                testing: {...settings.dmx.testing, simulateUsbDmx: checked}
                                            }
                                        }, "immediate")}
                                        disabled={dmxControlsDisabled}
                                    />
                                    <span>Simulate USB-DMX512 interface</span>
                                </label>
                                <label className="flex items-center gap-3">
                                    <Switch
                                        checked={settings.dmx.testing.simulateArtNet}
                                        onCheckedChange={(checked) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                testing: {...settings.dmx.testing, simulateArtNet: checked}
                                            }
                                        }, "immediate")}
                                        disabled={dmxControlsDisabled}
                                    />
                                    <span>Simulate Art-Net interface</span>
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Simulated interfaces run in-process workers so DMX live output can be tested without hardware.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">DMX USB interface</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <label className="flex items-center gap-3">
                                <Switch
                                    checked={usbTransportEnabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        dmx: {
                                            ...settings.dmx,
                                            usb: {...settings.dmx.usb, enabled: checked},
                                        }
                                    }, "immediate")}
                                    disabled={dmxControlsDisabled}
                                />
                                <span>Enable USB transport</span>
                            </label>
                            <p className="text-sm opacity-70">
                                Select the active USB-to-DMX serial interface. Selection is saved automatically and used when USB transport is enabled.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <NativeSelect
                                    className="w-full md:w-[28rem]"
                                    value={dmxState.selectedUSBDeviceId ?? ""}
                                    onChange={(event) => onSelectUSBSerialDevice(event.target.value)}
                                    disabled={usbFieldsDisabled}
                                >
                                    <NativeSelectOption value="">No device selected</NativeSelectOption>
                                    {usbSerialDevices.map((device) => (
                                        <NativeSelectOption key={device.id} value={device.id}>
                                            {device.name} ({device.path})
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={onRefreshUSBSerialDevices}
                                    disabled={usbFieldsDisabled}
                                >
                                    Refresh USB devices
                                </Button>
                            </div>
                            {dmxState.selectedUSBDeviceId && !usbSerialDevices.some((device) => device.id === dmxState.selectedUSBDeviceId) && (
                                <p className="text-xs text-destructive">
                                    Selected device is currently unavailable: <code>{dmxState.selectedUSBDeviceId}</code>
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Art-Net output</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <label className="flex items-center gap-3">
                                <Switch
                                    checked={settings.dmx.artNet.enabled}
                                    onCheckedChange={(checked) => updateSettings({
                                        ...settings,
                                        dmx: {
                                            ...settings.dmx,
                                            artNet: {...settings.dmx.artNet, enabled: checked}
                                        }
                                    }, "immediate")}
                                    disabled={dmxControlsDisabled}
                                />
                                <span>Enable Art-Net transport</span>
                            </label>

                            <p className="text-xs text-muted-foreground">
                                Based on common Art-Net controller setups (QLC+ style): configure target IP, Net/Subnet/Universe, and frame rate.
                            </p>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <Field>
                                    <FieldLabel htmlFor="artnet-target">Target host / broadcast</FieldLabel>
                                    <Input
                                        id="artnet-target"
                                        value={settings.dmx.artNet.targetHost}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, targetHost: e.target.value}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="artnet-port">UDP port</FieldLabel>
                                    <Input
                                        id="artnet-port"
                                        type="number"
                                        min={1}
                                        max={65535}
                                        value={settings.dmx.artNet.port}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, port: readNumber(e.target.value, 6454)}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="artnet-net">Net (0-127)</FieldLabel>
                                    <Input
                                        id="artnet-net"
                                        type="number"
                                        min={0}
                                        max={127}
                                        value={settings.dmx.artNet.net}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, net: readNumber(e.target.value, 0)}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="artnet-subnet">Subnet (0-15)</FieldLabel>
                                    <Input
                                        id="artnet-subnet"
                                        type="number"
                                        min={0}
                                        max={15}
                                        value={settings.dmx.artNet.subnet}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, subnet: readNumber(e.target.value, 0)}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="artnet-universe">Universe (0-15)</FieldLabel>
                                    <Input
                                        id="artnet-universe"
                                        type="number"
                                        min={0}
                                        max={15}
                                        value={settings.dmx.artNet.universe}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, universe: readNumber(e.target.value, 0)}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="artnet-refresh">Refresh Hz</FieldLabel>
                                    <Input
                                        id="artnet-refresh"
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={settings.dmx.artNet.refreshHz}
                                        onChange={(e) => updateSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, refreshHz: readNumber(e.target.value, 44)}
                                            }
                                        })}
                                        onBlur={flushAutosaveNow}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {!consoleDetached && (
                    <TabsContent value="console" className="space-y-5">
                        <TransportConsolePanel
                            entries={consoleEntries}
                            onClear={onClearConsole}
                            onToggleDetach={onToggleConsoleDetach}
                            detached={false}
                        />
                    </TabsContent>
                )}
            </Tabs>

            {snapshot && (
                <p className="text-xs opacity-60">
                    Persistence: <code>{snapshot.persistencePath}</code> • backend: {snapshot.capabilities.networkBackendLabel}
                    {" "}({snapshot.capabilities.networkBackendId}) • host CLI: <code>{snapshot.capabilities.networkCliName || "—"}</code>
                    {snapshot.capabilities.networkControlAvailable ? "" : snapshot.capabilities.networkCliUnavailableReason && <> — <span
                        className="opacity-90">{snapshot.capabilities.networkCliUnavailableReason}</span></>}
                </p>
            )}
        </div>
    );
}


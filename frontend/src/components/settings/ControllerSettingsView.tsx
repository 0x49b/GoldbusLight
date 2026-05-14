import type {Dispatch, SetStateAction} from "react";
import {prettyJSON, readNumber} from "../../lib/json";
import {PiFloppyDisk, PiWifiHigh} from "react-icons/pi";
import type {
    ControllerSettings,
    ControllerSnapshot,
    DMXState,
    NetworkApplyResult,
    USBSerialDevice,
    WLEDDevice,
} from "../../types/controller";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {Switch} from "@/components/ui/switch";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";

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
    onSaveSettings: () => void;
    onApplyNetwork: () => void;
    onUnignoreDevice: (deviceId: string) => void;
    currentVersion: string;
    dmxState: DMXState;
    usbSerialDevices: USBSerialDevice[];
    onRefreshUSBSerialDevices: () => void;
    onSelectUSBSerialDevice: (deviceId: string) => void;
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
                                           onApplyNetwork,
                                           onUnignoreDevice,
                                           currentVersion,
                                           dmxState,
                                           usbSerialDevices,
                                           onRefreshUSBSerialDevices,
                                           onSelectUSBSerialDevice,
                                       }: ControllerSettingsViewProps) {
    if (!settings) {
        return <p className="opacity-70">Loading settings…</p>;
    }

    const wledControlsDisabled = busy || !settings.wled.enabled;
    const dmxControlsDisabled = busy || !settings.dmx.enabled;
    const artNetFieldsDisabled = dmxControlsDisabled || !settings.dmx.artNet.enabled;

    return (
        <div className="space-y-5 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Controller settings</h2>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={onApplyNetwork} disabled={busy}>
                        <PiWifiHigh/> Apply network settings
                    </Button>
                    <Button size="sm" onClick={onSaveSettings} disabled={busy}>
                        <PiFloppyDisk/> Save settings
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="general" className="w-full">
                <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="wled">WLED</TabsTrigger>
                    <TabsTrigger value="dmx">DMX</TabsTrigger>
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
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        wled: {...settings.wled, enabled: checked}
                                    })}
                                    disabled={busy}
                                />
                                <span>Enable WLED component</span>
                            </label>
                            {!settings.wled.enabled && (
                                <p className="text-xs text-muted-foreground">
                                    WLED routes, menu entries, discovery, and device actions are disabled while this is off.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle>Access point</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="flex items-center gap-3">
                                <Switch
                                    id="enable-ap"
                                    checked={settings.accessPoint.enabled}
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        accessPoint: {...settings.accessPoint, enabled: checked}
                                    })}
                                    disabled={wledControlsDisabled}
                                />
                                <Label htmlFor="enable-ap">Enable local access point</Label>
                            </label>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <Field>
                                    <FieldLabel htmlFor="ap-connection-name">AP connection name</FieldLabel>
                                    <Input
                                        id="ap-connection-name"
                                        type="text"
                                        value={settings.accessPoint.connection}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, connection: e.target.value}
                                        })}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-interface">AP interface</FieldLabel>
                                    <Input
                                        id="ap-interface"
                                        type="text"
                                        value={settings.accessPoint.interfaceName}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, interfaceName: e.target.value}
                                        })}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-ssid">AP SSID</FieldLabel>
                                    <Input
                                        id="ap-ssid"
                                        type="text"
                                        value={settings.accessPoint.ssid}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, ssid: e.target.value}
                                        })}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-password">AP password</FieldLabel>
                                    <Input
                                        id="ap-password"
                                        type="text"
                                        value={settings.accessPoint.password}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            accessPoint: {...settings.accessPoint, password: e.target.value}
                                        })}
                                        disabled={wledControlsDisabled}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="ap-channel">Channel</FieldLabel>
                                    <Input
                                        id="ap-channel"
                                        type="number"
                                        value={settings.accessPoint.channel}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            accessPoint: {
                                                ...settings.accessPoint,
                                                channel: readNumber(e.target.value, 6)
                                            }
                                        })}
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
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {...settings.wled.discovery, enabled: checked}
                                        }
                                    })}
                                    disabled={wledControlsDisabled}
                                />
                                <span>Enable mDNS discovery loop</span>
                            </label>

                            <label className="flex cursor-pointer justify-start gap-3 items-center">
                                <Switch
                                    checked={settings.wled.testing.simulateWled}
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            testing: {...settings.wled.testing, simulateWled: checked}
                                        }
                                    })}
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
                                    onChange={(e) => setSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {
                                                ...settings.wled.discovery,
                                                intervalSeconds: readNumber(e.target.value, 15)
                                            }
                                        }
                                    })}
                                    placeholder="Interval (s)"
                                    disabled={wledControlsDisabled}
                                />
                                <Input
                                    className="h-8"
                                    type="number"
                                    min={500}
                                    value={settings.wled.discovery.queryTimeoutMs}
                                    onChange={(e) => setSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            discovery: {
                                                ...settings.wled.discovery,
                                                queryTimeoutMs: readNumber(e.target.value, 2000)
                                            }
                                        }
                                    })}
                                    placeholder="Query timeout ms"
                                    disabled={wledControlsDisabled}
                                />
                            </div>

                            <Input
                                className="h-8"
                                placeholder="Service types (comma separated)"
                                value={settings.wled.discovery.serviceTypes.join(",")}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    wled: {
                                        ...settings.wled,
                                        discovery: {
                                            ...settings.wled.discovery,
                                            serviceTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                                        }
                                    }
                                })}
                                disabled={wledControlsDisabled}
                            />

                            <label className="flex cursor-pointer justify-start gap-3 items-center">
                                <Switch
                                    checked={settings.wled.provisioning.autoProvision}
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        wled: {
                                            ...settings.wled,
                                            provisioning: {...settings.wled.provisioning, autoProvision: checked}
                                        }
                                    })}
                                    disabled={wledControlsDisabled}
                                />
                                <span>Auto-provision newly discovered devices</span>
                            </label>

                            <div>
                                <Label className="py-0 text-xs">Default /json/state payload</Label>
                                <Textarea
                                    className="h-24 w-full font-mono text-xs"
                                    value={statePayloadText}
                                    onChange={(e) => setStatePayloadText(e.target.value)}
                                    disabled={wledControlsDisabled}
                                />
                            </div>

                            <div>
                                <Label className="py-0 text-xs">Default /json/cfg patch</Label>
                                <Textarea
                                    className="h-24 w-full font-mono text-xs"
                                    value={configPatchText}
                                    onChange={(e) => setConfigPatchText(e.target.value)}
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
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        dmx: {...settings.dmx, enabled: checked}
                                    })}
                                    disabled={busy}
                                />
                                <span>Enable DMX component</span>
                            </label>
                            {!settings.dmx.enabled && (
                                <p className="text-xs text-muted-foreground">
                                    DMX pages and menu entries are hidden, and live USB/Art-Net output is disconnected.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="w-full max-w-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">DMX USB interface</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm opacity-70">
                                Select the active USB-to-DMX serial interface. Selection is saved automatically.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <NativeSelect
                                    className="w-full md:w-[28rem]"
                                    value={dmxState.selectedUSBDeviceId ?? ""}
                                    onChange={(event) => onSelectUSBSerialDevice(event.target.value)}
                                    disabled={dmxControlsDisabled}
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
                                    disabled={dmxControlsDisabled}
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
                                    onCheckedChange={(checked) => setSettings({
                                        ...settings,
                                        dmx: {
                                            ...settings.dmx,
                                            artNet: {...settings.dmx.artNet, enabled: checked}
                                        }
                                    })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, targetHost: e.target.value}
                                            }
                                        })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, port: readNumber(e.target.value, 6454)}
                                            }
                                        })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, net: readNumber(e.target.value, 0)}
                                            }
                                        })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, subnet: readNumber(e.target.value, 0)}
                                            }
                                        })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, universe: readNumber(e.target.value, 0)}
                                            }
                                        })}
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
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            dmx: {
                                                ...settings.dmx,
                                                artNet: {...settings.dmx.artNet, refreshHz: readNumber(e.target.value, 44)}
                                            }
                                        })}
                                        disabled={artNetFieldsDisabled}
                                    />
                                </Field>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
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

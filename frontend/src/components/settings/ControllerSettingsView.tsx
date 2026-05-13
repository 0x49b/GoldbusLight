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
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

import {Alert, AlertDescription} from "@/components/ui/alert";
import {Label} from "@/components/ui/label"
import {Switch} from "@/components/ui/switch"
import {Field, FieldLabel,} from "@/components/ui/field"
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";


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

    return (
        <div className="space-y-5 w-full max-w-none pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Controller settings</h2>
                <Button size="sm" variant="outline" onClick={onApplyNetwork} disabled={busy}>
                    <PiWifiHigh/> Apply network settings
                </Button>
            </div>

            <Card className="w-full max-w-none">
                <CardHeader>
                    <CardTitle>
                        Access point
                    </CardTitle>
                </CardHeader>
                <CardContent>

                    <div className="flex items-center space-x-2">
                        <Switch id="enable-ap"
                                checked={settings.accessPoint.enabled}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    accessPoint: {...settings.accessPoint, enabled: checked}
                                })}/>
                        <Label htmlFor="enable-ap">Enable Local Access Point</Label>
                    </div>


                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">


                        <Field>
                            <FieldLabel htmlFor="ap-connection-name">AP Connection Name</FieldLabel>
                            <Input
                                id="ap-connection-name"
                                type="text"
                                value={settings.accessPoint.connection}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    accessPoint: {
                                        ...settings.accessPoint,
                                        connection: e.target.value
                                    }
                                })}
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="ap-interface">AP Interface</FieldLabel>
                            <Input id="ap-interface" type="text"
                                   value={settings.accessPoint.interfaceName}
                                   onChange={(e) => setSettings({
                                       ...settings,
                                       accessPoint: {
                                           ...settings.accessPoint,
                                           interfaceName: e.target.value
                                       }
                                   })}
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="ap-ssid">AP SSID</FieldLabel>
                            <Input id="ap-ssid" type="text" value={settings.accessPoint.ssid}
                                   onChange={(e) => setSettings({
                                       ...settings,
                                       accessPoint: {...settings.accessPoint, ssid: e.target.value}
                                   })}/>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="ap-password">AP Password</FieldLabel>
                            <Input id="ap-password" type="text"
                                   value={settings.accessPoint.password}
                                   onChange={(e) => setSettings({
                                       ...settings,
                                       accessPoint: {
                                           ...settings.accessPoint,
                                           password: e.target.value
                                       }
                                   })}/>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="ap-channel">Channel</FieldLabel>
                            <Input id="ap-channel" type="number"
                                   value={settings.accessPoint.channel}
                                   onChange={(e) => setSettings({
                                       ...settings,
                                       accessPoint: {
                                           ...settings.accessPoint,
                                           channel: readNumber(e.target.value, 6)
                                       }
                                   })}/>
                        </Field>


                    </div>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader><CardTitle className="text-sm font-semibold">Discovery /
                    provisioning</CardTitle></CardHeader>
                <CardContent>
                    <label className="flex cursor-pointer justify-start gap-3 items-center">
                        <Switch checked={settings.discovery.enabled}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    discovery: {...settings.discovery, enabled: checked}
                                })}/>
                        <span>Enable mDNS discovery loop</span>
                    </label>
                    <label className="flex cursor-pointer justify-start gap-3 items-center">
                        <Switch checked={settings.testing.simulateWled}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    testing: {...settings.testing, simulateWled: checked}
                                })}/>
                        <span>Simulate WLED device (testing)</span>
                    </label>
                    <p className="text-xs opacity-60">Adds an in-app fake device (<code
                        className="font-mono text-[10px]">sim:wled</code>) with no network traffic.
                        Enable this option, save settings, then pick the device from the list
                        (Discover or wait for the next snapshot refresh).</p>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Input className="h-8" type="number" min={2}
                               value={settings.discovery.intervalSeconds}
                               onChange={(e) => setSettings({
                                   ...settings,
                                   discovery: {
                                       ...settings.discovery,
                                       intervalSeconds: readNumber(e.target.value, 15)
                                   }
                               })} placeholder="Interval (s)"/>
                        <Input className="h-8" type="number" min={500}
                               value={settings.discovery.queryTimeoutMs}
                               onChange={(e) => setSettings({
                                   ...settings,
                                   discovery: {
                                       ...settings.discovery,
                                       queryTimeoutMs: readNumber(e.target.value, 2000)
                                   }
                               })} placeholder="Query timeout ms"/>
                    </div>

                    <Input className="h-8" placeholder="Service types (comma separated)"
                           value={settings.discovery.serviceTypes.join(",")}
                           onChange={(e) => setSettings({
                               ...settings,
                               discovery: {
                                   ...settings.discovery,
                                   serviceTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                               }
                           })}/>

                    <label className="flex cursor-pointer justify-start gap-3 items-center">
                        <Switch checked={settings.provisioning.autoProvision}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    provisioning: {...settings.provisioning, autoProvision: checked}
                                })}/>
                        <span>Auto-provision newly discovered devices</span>
                    </label>

                    <div>
                        <Label className="py-0 text-xs">Default /json/state payload</Label>
                        <Textarea className="h-24 w-full font-mono text-xs" value={statePayloadText}
                                  onChange={(e) => setStatePayloadText(e.target.value)}/>
                    </div>

                    <div>
                        <Label className="py-0 text-xs">Default /json/cfg patch</Label>
                        <Textarea className="h-24 w-full font-mono text-xs" value={configPatchText}
                                  onChange={(e) => setConfigPatchText(e.target.value)}/>
                    </div>

                    <Button size="sm" onClick={onSaveSettings}
                            disabled={busy}><PiFloppyDisk/> Save</Button>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader><CardTitle className="text-sm font-semibold">Application
                    version</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm opacity-70">Running: <code>{currentVersion}</code></p>
                    <p className="text-xs opacity-60">Updates are installed from the Pi shell
                        with <code>scripts/install-release.sh &lt;tag&gt;</code>.</p>
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader><CardTitle className="text-sm font-semibold">DMX USB interface</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm opacity-70">Select the active USB-to-DMX serial interface. Selection is saved automatically.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <NativeSelect
                            className="w-full md:w-[28rem]"
                            value={dmxState.selectedUSBDeviceId ?? ""}
                            onChange={(event) => onSelectUSBSerialDevice(event.target.value)}
                        >
                            <NativeSelectOption value="">No device selected</NativeSelectOption>
                            {usbSerialDevices.map((device) => (
                                <NativeSelectOption key={device.id} value={device.id}>
                                    {device.name} ({device.path})
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <Button type="button" size="sm" variant="outline" onClick={onRefreshUSBSerialDevices} disabled={busy}>
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
                <CardHeader><CardTitle className="text-sm font-semibold">Ignored devices</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm opacity-70">Ignored devices stay out of the sidebar and
                        presets but remain in <code className="text-xs">state.json</code>. Use this
                        to hide unrelated mDNS hosts.</p>
                    {ignoredDevices.length === 0 ? (
                        <p className="text-sm opacity-60">No ignored devices.</p>
                    ) : (
                        <ul className="space-y-2">
                            {ignoredDevices.map((dev) => (
                                <li key={dev.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{dev.name}</div>
                                        <div
                                            className="text-xs opacity-60 font-mono truncate">{dev.address}:{dev.port} • {dev.id}</div>
                                    </div>
                                    <Button type="button" variant="outline" size="sm"
                                            className="shrink-0"
                                            onClick={() => onUnignoreDevice(dev.id)}
                                            disabled={busy}>Un-ignore</Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card className="w-full max-w-none">
                <CardHeader><CardTitle className="text-sm font-semibold">Network apply
                    result</CardTitle></CardHeader>
                <CardContent>
                    {!applyResult && <p className="text-sm opacity-70">No apply action yet.</p>}
                    {applyResult && (
                        <div className="space-y-2">
                            <p className="text-sm">{applyResult.dryRun ? "Dry-run (network CLI unavailable or unsupported)" : "Applied"}</p>
                            {(applyResult.warnings ?? []).map((warning) => (
                                <Alert key={warning}
                                       className="py-1 text-xs"><AlertDescription>{warning}</AlertDescription></Alert>
                            ))}
                            <div className="max-h-48 overflow-auto rounded border p-2 bg-card">
                                <pre
                                    className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {snapshot && (
                <p className="text-xs opacity-60">
                    Persistence: <code>{snapshot.persistencePath}</code> •
                    backend: {snapshot.capabilities.networkBackendLabel} ({snapshot.capabilities.networkBackendId})
                    • host CLI: <code>{snapshot.capabilities.networkCliName || "—"}</code>
                    {snapshot.capabilities.networkControlAvailable ? "" : snapshot.capabilities.networkCliUnavailableReason && <> — <span
                        className="opacity-90">{snapshot.capabilities.networkCliUnavailableReason}</span></>}
                </p>
            )}
        </div>
    );
}

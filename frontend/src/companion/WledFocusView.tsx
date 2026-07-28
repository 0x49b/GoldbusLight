import {useMemo, useState} from "react";
import type {WLEDDevice} from "@/types/controller.ts";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Slider} from "@/components/ui/slider";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {applyWledPreset, setWledDeviceState} from "./api";

type WledFocusViewProps = {
    device: WLEDDevice;
    busy: boolean;
    setBusy: (v: boolean) => void;
    setError: (message: string | null) => void;
    onRefresh: () => void;
};

function rgbFromState(device: WLEDDevice): [number, number, number] {
    const last = device.lastState;
    const seg = Array.isArray(last?.seg) ? (last?.seg as unknown[])[0] : null;
    if (seg && typeof seg === "object" && seg !== null && "col" in seg) {
        const col = (seg as {col?: unknown}).col;
        if (Array.isArray(col) && Array.isArray(col[0]) && col[0].length >= 3) {
            return [
                Number(col[0][0]) || 0,
                Number(col[0][1]) || 0,
                Number(col[0][2]) || 0,
            ];
        }
    }
    return [255, 180, 80];
}

export function WledFocusView({device, busy, setBusy, setError, onRefresh}: WledFocusViewProps) {
    const initialRgb = useMemo(() => rgbFromState(device), [device]);
    const [on, setOn] = useState(device.lastState?.on !== false);
    const [bri, setBri] = useState(
        typeof device.lastState?.bri === "number" ? Math.round(device.lastState.bri as number) : 180,
    );
    const [rgb, setRgb] = useState<[number, number, number]>(initialRgb);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            onRefresh();
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    };

    const pushState = async (patch: Record<string, unknown>) => {
        await run(() => setWledDeviceState(device.id, patch));
    };

    const hex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">{device.name || device.address}</h2>
                <p className="text-sm text-muted-foreground">
                    {device.address}
                    {device.online ? " · online" : " · offline"}
                </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-3">
                <Label htmlFor="wled-on">Power</Label>
                <Switch
                    id="wled-on"
                    checked={on}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                        setOn(checked);
                        void pushState({on: checked});
                    }}
                />
            </div>

            <div className="space-y-2 rounded-lg border px-3 py-3">
                <div className="flex items-center justify-between">
                    <Label>Brightness</Label>
                    <span className="text-sm text-muted-foreground">{bri}</span>
                </div>
                <Slider
                    min={1}
                    max={255}
                    step={1}
                    value={[bri]}
                    disabled={busy}
                    onValueChange={([v]) => setBri(v ?? bri)}
                    onValueCommit={([v]) => {
                        const next = v ?? bri;
                        setBri(next);
                        void pushState({bri: next});
                    }}
                />
            </div>

            <div className="space-y-3 rounded-lg border px-3 py-3">
                <Label htmlFor="wled-color">Color</Label>
                <Input
                    id="wled-color"
                    type="color"
                    value={hex}
                    disabled={busy}
                    className="h-12 w-full cursor-pointer p-1"
                    onChange={(e) => {
                        const value = e.target.value.replace("#", "");
                        if (value.length !== 6) {
                            return;
                        }
                        const next: [number, number, number] = [
                            parseInt(value.slice(0, 2), 16),
                            parseInt(value.slice(2, 4), 16),
                            parseInt(value.slice(4, 6), 16),
                        ];
                        setRgb(next);
                        void pushState({
                            on: true,
                            seg: [{id: 0, col: [next], fx: 0}],
                        });
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() =>
                        void pushState({
                            on: true,
                            seg: [{id: 0, col: [rgb], fx: 0}],
                        })
                    }
                >
                    Apply solid color
                </Button>
            </div>

            <div className="space-y-2">
                <h3 className="text-sm font-semibold">Presets</h3>
                {(device.presets ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No presets saved on this device.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {(device.presets ?? []).map((preset) => (
                            <Button
                                key={preset.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void run(() => applyWledPreset(device.id, preset.id))}
                            >
                                {preset.name || preset.id}
                            </Button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

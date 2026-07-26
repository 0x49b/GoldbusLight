import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {Slider} from "@/components/ui/slider";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import type {DMXColorSweep} from "@/types/controller.ts";

export type ColorSweepPanelProps = {
    value: DMXColorSweep;
    onChange: (next: DMXColorSweep) => void;
    slaveCount: number;
    busy?: boolean;
    /** Compact Live-tab layout vs Editor card. */
    variant?: "live" | "editor";
};

function normalizeLocal(value: DMXColorSweep): Required<Pick<DMXColorSweep, "enabled" | "direction" | "speed">> {
    return {
        enabled: value.enabled === true,
        direction: value.direction === "rtl" ? "rtl" : "ltr",
        speed: Math.max(1, Math.min(100, Math.round(value.speed ?? 50) || 50)),
    };
}

export function ColorSweepPanel({
    value,
    onChange,
    slaveCount,
    busy = false,
    variant = "live",
}: ColorSweepPanelProps) {
    const sweep = normalizeLocal(value);

    const body = (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Rainbow hue travels across this Color Changer and its linked slaves
                {slaveCount > 0 ? ` (${slaveCount} slave${slaveCount === 1 ? "" : "s"})` : ""}.
                Order follows DMX start address.
            </p>
            {slaveCount < 1 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    Link other Color Changers as slaves of this fixture to create a spatial left↔right sweep.
                </p>
            ) : null}
            <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">Enable Sweep</span>
                <Switch
                    checked={sweep.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => onChange({...sweep, enabled: checked})}
                />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="color-sweep-direction">Direction</Label>
                    <NativeSelect
                        id="color-sweep-direction"
                        className="w-full"
                        value={sweep.direction}
                        disabled={busy || !sweep.enabled}
                        onChange={(e) =>
                            onChange({
                                ...sweep,
                                direction: e.target.value === "rtl" ? "rtl" : "ltr",
                            })
                        }
                    >
                        <NativeSelectOption value="ltr">Left → right</NativeSelectOption>
                        <NativeSelectOption value="rtl">Right → left</NativeSelectOption>
                    </NativeSelect>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="color-sweep-speed">Speed — {sweep.speed}%</Label>
                    <Slider
                        id="color-sweep-speed"
                        min={1}
                        max={100}
                        step={1}
                        value={[sweep.speed]}
                        disabled={busy || !sweep.enabled}
                        onValueChange={([next]) =>
                            onChange({
                                ...sweep,
                                speed: Math.max(1, Math.min(100, Math.round(next ?? 50))),
                            })
                        }
                    />
                </div>
            </div>
        </div>
    );

    if (variant === "editor") {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Color Sweep</CardTitle>
                </CardHeader>
                <CardContent>{body}</CardContent>
            </Card>
        );
    }

    return (
        <div className="rounded-md border bg-muted/20 px-3 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Color Sweep
            </div>
            {body}
        </div>
    );
}

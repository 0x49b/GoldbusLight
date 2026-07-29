import {useTranslation} from "react-i18next";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Field, FieldLabel} from "@/components/ui/field.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Switch} from "@/components/ui/switch.tsx";
import {readNumber} from "@/lib/json.ts";
import type {ArtNetSettings} from "@/types/controller.ts";

type DmxArtNetCardProps = {
    artNet: ArtNetSettings;
    disabled: boolean;
    fieldsDisabled: boolean;
    updateArtNet: (patch: Partial<ArtNetSettings>, mode?: "debounced" | "immediate") => void;
    flushAutosaveNow: () => void;
};

export function DmxArtNetCard({
    artNet,
    disabled,
    fieldsDisabled,
    updateArtNet,
    flushAutosaveNow,
}: DmxArtNetCardProps) {
    const {t} = useTranslation("settings");

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("dmxTab.artNetTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-center gap-3">
                    <Switch
                        checked={artNet.enabled}
                        onCheckedChange={(checked) => updateArtNet({enabled: checked}, "immediate")}
                        disabled={disabled}
                    />
                    <span>{t("dmxTab.enableArtNet")}</span>
                </label>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Field>
                        <FieldLabel>{t("dmxTab.targetHost")}</FieldLabel>
                        <Input
                            value={artNet.targetHost}
                            onChange={(e) => updateArtNet({targetHost: e.target.value})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>{t("dmxTab.udpPort")}</FieldLabel>
                        <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={artNet.port}
                            onChange={(e) => updateArtNet({port: readNumber(e.target.value, 6454)})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>{t("dmxTab.net")}</FieldLabel>
                        <Input
                            type="number"
                            min={0}
                            max={127}
                            value={artNet.net}
                            onChange={(e) => updateArtNet({net: readNumber(e.target.value, 0)})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>{t("dmxTab.subnet")}</FieldLabel>
                        <Input
                            type="number"
                            min={0}
                            max={15}
                            value={artNet.subnet}
                            onChange={(e) => updateArtNet({subnet: readNumber(e.target.value, 0)})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>{t("dmxTab.artNetUniverse")}</FieldLabel>
                        <Input
                            type="number"
                            min={0}
                            max={15}
                            value={artNet.universe}
                            onChange={(e) => updateArtNet({universe: readNumber(e.target.value, 0)})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>{t("dmxTab.refreshHz")}</FieldLabel>
                        <Input
                            type="number"
                            min={1}
                            max={50}
                            value={artNet.refreshHz}
                            onChange={(e) => updateArtNet({refreshHz: readNumber(e.target.value, 44)})}
                            onBlur={flushAutosaveNow}
                            disabled={fieldsDisabled}
                        />
                    </Field>
                </div>
            </CardContent>
        </Card>
    );
}

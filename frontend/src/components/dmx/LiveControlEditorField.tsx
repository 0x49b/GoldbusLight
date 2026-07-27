import {EyeOff} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {Label} from "@/components/ui/label";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {
    getDmxLiveWidgetOptions,
    getLiveSliderLabelOptions,
    isDegreeSliderChannel,
    liveWidgetHasOrientableSlider,
    liveWidgetHiddenBadgeLabel,
    liveWidgetHiddenSource,
    liveWidgetLabel,
    readLiveSliderLabelMode,
    readLiveSliderOrientation,
    readLiveWidgetOverride,
    resolveLiveWidget,
    type DMXLiveWidget,
    type LiveSliderLabelMode,
} from "@/lib/dmxLiveWidget";
import {cn} from "@/lib/utils";
import type {DMXChannel, JSONMap} from "@/types/controller";
import {useTranslation} from "react-i18next";
import {liveWidgetPreviewLine} from "./LiveChannelControl";

export type LiveControlEditorFieldProps = {
    channel: DMXChannel;
    properties: JSONMap;
    busy?: boolean;
    onPropertiesChange: (next: JSONMap) => void;
};

export function LiveControlEditorField({
    channel,
    properties,
    busy,
    onPropertiesChange,
}: LiveControlEditorFieldProps) {
    const {t} = useTranslation("dmx");
    const hiddenSource = liveWidgetHiddenSource(channel);
    const resolved = resolveLiveWidget(channel);
    const override = readLiveWidgetOverride(properties);
    const showSliderLabelMode = resolved === "slider" && !isDegreeSliderChannel(channel);
    const showOrientation = liveWidgetHasOrientableSlider(channel);
    const sliderLabelMode = readLiveSliderLabelMode(properties, channel);
    const sliderHorizontal = readLiveSliderOrientation(properties) === "horizontal";
    const widgetOptions = getDmxLiveWidgetOptions();
    const sliderLabelOptions = getLiveSliderLabelOptions();

    return (
        <div
            className={cn(
                "mt-2 max-w-md space-y-1.5 rounded-md border p-2.5 transition-colors",
                hiddenSource
                    ? "border-amber-500/45 bg-amber-500/[0.07] dark:bg-amber-500/10"
                    : "border-transparent bg-transparent",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">{t("liveControl.sectionLabel")}</Label>
                {hiddenSource ? (
                    <Badge
                        variant="outline"
                        className="gap-1 border-amber-600/50 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-200"
                    >
                        <EyeOff className="size-3 shrink-0" aria-hidden/>
                        {liveWidgetHiddenBadgeLabel(hiddenSource)}
                    </Badge>
                ) : null}
                {override === undefined && resolved !== "hidden" ? (
                    <span className="text-[10px] text-muted-foreground">
                        {t("liveControl.autoArrow", {label: liveWidgetLabel(resolved)})}
                    </span>
                ) : null}
            </div>
            <NativeSelect
                value={override ?? "auto"}
                onChange={(e) => {
                    const v = e.target.value as DMXLiveWidget;
                    const nextProps = {...properties};
                    if (v === "auto") {
                        delete nextProps.liveWidget;
                    } else {
                        nextProps.liveWidget = v;
                    }
                    onPropertiesChange(nextProps);
                }}
                disabled={busy}
                className={cn(hiddenSource && "border-amber-500/30")}
            >
                {widgetOptions.map((opt) => (
                    <NativeSelectOption key={opt.value} value={opt.value}>
                        {opt.label}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
            {showSliderLabelMode ? (
                <div className="space-y-1">
                    <Label className="text-xs">{t("liveControl.liveValueLabel")}</Label>
                    <NativeSelect
                        value={sliderLabelMode}
                        onChange={(e) => {
                            const v = e.target.value as LiveSliderLabelMode;
                            const nextProps = {...properties, liveSliderLabel: v};
                            onPropertiesChange(nextProps);
                        }}
                        disabled={busy}
                    >
                        {sliderLabelOptions.map((opt) => (
                            <NativeSelectOption key={opt.value} value={opt.value}>
                                {opt.label}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </div>
            ) : null}
            {showOrientation ? (
                <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs">
                    <Checkbox
                        checked={sliderHorizontal}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                            const nextProps = {...properties};
                            if (checked === true) {
                                nextProps.liveSliderOrientation = "horizontal";
                            } else {
                                delete nextProps.liveSliderOrientation;
                            }
                            onPropertiesChange(nextProps);
                        }}
                    />
                    <span>{t("liveControl.horizontalSlider")}</span>
                    <span className="text-[10px] text-muted-foreground">{t("liveControl.verticalHint")}</span>
                </label>
            ) : null}
            <p
                className={cn(
                    "text-[11px]",
                    hiddenSource ? "font-medium text-amber-900/90 dark:text-amber-100/90" : "text-muted-foreground",
                )}
            >
                {liveWidgetPreviewLine(channel)}
            </p>
        </div>
    );
}

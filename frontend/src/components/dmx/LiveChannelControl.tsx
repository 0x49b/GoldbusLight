import type {DMXChannel, DMXFixture, JSONMap} from "@/types/controller.ts";
import type {DMXLiveShutterMode, DMXLiveControlState, EntryChannelLiveState} from "@/lib/dmxLiveMap.ts";
import {
    channelLiveLabel,
    channelOutputByte,
    defaultEntryStateForChannel,
    parseFixtureEntries,
    patchEntryChannel,
} from "@/lib/dmxLiveMap.ts";
import {
    findOffButtonSlotIndex,
    firstSliderSlotIndex,
    isDegreeSliderChannel,
    liveWidgetHiddenSource,
    parseEntryLiveSlotKinds,
    liveSliderLabelModeHint,
    readLiveSliderLabelMode,
    resolveLiveWidget,
    type LiveSlotKind,
} from "@/lib/dmxLiveWidget.ts";
import {channelIncludedInParty} from "@/lib/dmxPartyInclude.ts";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {ColorWheelSegmentControl} from "./ColorWheelSegmentControl";
import {GoboWheelSegmentControl} from "./GoboWheelSegmentControl";
import {LiveControlLabel} from "./LiveControlLabel";

const SHUTTER_OPTIONS: { value: DMXLiveShutterMode; label: string; symbol: string }[] = [
    {value: "open", label: "Open", symbol: "●"},
    {value: "closed", label: "Closed", symbol: "○"},
    {value: "strobe", label: "Strobe", symbol: "⚡"},
    {value: "pulse", label: "Pulse", symbol: "▲"},
];

type LiveChannelControlProps = {
    fixture: DMXFixture;
    channel: DMXChannel;
    liveState: DMXLiveControlState;
    onStateChange: (next: DMXLiveControlState) => void;
    disabled?: boolean;
    compact?: boolean;
};

function useEntryState(
    liveState: DMXLiveControlState,
    channel: DMXChannel,
): EntryChannelLiveState {
    return liveState.entryChannels[channel.channel] ?? defaultEntryStateForChannel(channel);
}

export function LiveChannelControl({
    fixture,
    channel,
    liveState,
    onStateChange,
    disabled = false,
    compact = false,
}: LiveChannelControlProps) {
    const widget = resolveLiveWidget(channel);
    if (widget === "hidden") {
        return null;
    }

    const props = channel.properties as JSONMap | undefined;
    const entries = parseFixtureEntries(props);
    const st = useEntryState(liveState, channel);
    const party = channelIncludedInParty(fixture, channel);
    const outputByte = channelOutputByte(channel, st, widget);
    const title = channelLiveLabel(channel);

    const patch = (partial: Partial<EntryChannelLiveState>) => {
        onStateChange(patchEntryChannel(liveState, channel.channel, partial));
    };

    const labelRow = (
        <div className={cn("flex justify-between gap-2", compact ? "text-xs" : "text-sm")}>
            <LiveControlLabel party={party} className={compact ? "text-xs" : undefined}>
                {title}
            </LiveControlLabel>
            <span className="shrink-0 tabular-nums text-muted-foreground">{outputByte}</span>
        </div>
    );

    if (widget === "colorWheel" && entries.length > 0) {
        const max = Math.max(0, entries.length - 1);
        return (
            <div className="space-y-2">
                {labelRow}
                <ColorWheelSegmentControl
                    entries={entries}
                    value={Math.min(st.slotIdx, max)}
                    onChange={(idx) => patch({slotIdx: idx})}
                    disabled={disabled}
                />
            </div>
        );
    }

    if (widget === "goboWheel" && entries.length > 0) {
        const max = Math.max(0, entries.length - 1);
        return (
            <div className="space-y-2">
                {labelRow}
                <GoboWheelSegmentControl
                    entries={entries}
                    value={Math.min(st.slotIdx, max)}
                    onChange={(idx) => patch({slotIdx: idx})}
                    disabled={disabled}
                />
            </div>
        );
    }

    if (widget === "shutterModes") {
        return (
            <div className="space-y-2">
                {labelRow}
                <div
                    className={cn(
                        "grid w-full grid-cols-2 overflow-hidden rounded-lg border border-border",
                        disabled && "pointer-events-none opacity-60",
                    )}
                    role="group"
                    aria-label="Shutter and strobe modes"
                >
                    {SHUTTER_OPTIONS.map((o, idx) => {
                        const active = (st.shutter ?? "open") === o.value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => patch({shutter: o.value})}
                                className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 text-left text-sm font-semibold transition-colors",
                                    idx % 2 === 0 && "border-r border-border",
                                    idx < 2 && "border-b border-border",
                                    active
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                )}
                                aria-pressed={active}
                                disabled={disabled}
                            >
                                <span className="text-base leading-none" aria-hidden>{o.symbol}</span>
                                <span>{o.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (widget === "buttonSlider" && entries.length > 0) {
        const kinds = parseEntryLiveSlotKinds(props, entries);
        const offIdx = findOffButtonSlotIndex(entries, kinds);
        const buttonSlot = st.buttonSlotIdx ?? (offIdx >= 0 ? offIdx : -1);
        const sliderIdx = st.activeSliderIdx ?? firstSliderSlotIndex(kinds);
        const isOff = offIdx >= 0 && buttonSlot === offIdx;

        return (
            <div className="space-y-3">
                {labelRow}
                {entries.map((entry, idx) => {
                    const kind: LiveSlotKind = kinds[idx] ?? "button";
                    const label = entry.label?.trim() || `Slot ${idx + 1}`;
                    if (kind === "button") {
                        const active = buttonSlot === idx;
                        const checked = offIdx >= 0 && idx === offIdx ? !isOff : active;
                        return (
                            <div key={idx} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                                <LiveControlLabel party={party} className="text-xs">
                                    {offIdx >= 0 && idx === offIdx ? "Output enabled" : label}
                                </LiveControlLabel>
                                <Switch
                                    checked={checked}
                                    disabled={disabled}
                                    onCheckedChange={(nextChecked) => {
                                        if (offIdx >= 0 && idx === offIdx) {
                                            if (!nextChecked) {
                                                patch({
                                                    buttonSlotIdx: offIdx,
                                                    slotIdx: offIdx,
                                                    within01: 0,
                                                });
                                                return;
                                            }
                                            const fallbackSlider = firstSliderSlotIndex(kinds);
                                            const nextSliderIdx = sliderIdx >= 0 ? sliderIdx : fallbackSlider;
                                            if (nextSliderIdx >= 0) {
                                                patch({
                                                    activeSliderIdx: nextSliderIdx,
                                                    buttonSlotIdx: -1,
                                                    slotIdx: nextSliderIdx,
                                                    within01: st.within01,
                                                });
                                            } else {
                                                patch({
                                                    buttonSlotIdx: -1,
                                                    slotIdx: idx,
                                                    within01: 0,
                                                });
                                            }
                                            return;
                                        }
                                        if (nextChecked) {
                                            patch({
                                                buttonSlotIdx: idx,
                                                slotIdx: idx,
                                                within01: 0,
                                            });
                                            return;
                                        }
                                        if (offIdx >= 0) {
                                            patch({
                                                buttonSlotIdx: offIdx,
                                                slotIdx: offIdx,
                                                within01: 0,
                                            });
                                            return;
                                        }
                                        const fallbackSlider = firstSliderSlotIndex(kinds);
                                        if (fallbackSlider >= 0) {
                                            patch({
                                                activeSliderIdx: fallbackSlider,
                                                buttonSlotIdx: -1,
                                                slotIdx: fallbackSlider,
                                                within01: st.within01,
                                            });
                                        } else {
                                            patch({
                                                buttonSlotIdx: -1,
                                                within01: 0,
                                            });
                                        }
                                    }}
                                />
                            </div>
                        );
                    }
                    const showSlider = sliderIdx === idx;
                    const t01 = showSlider ? st.within01 : 0;
                    const lo = Math.min(entry.from, entry.to);
                    const hi = Math.max(entry.from, entry.to);
                    const span = hi - lo;
                    const byteVal = Math.round(lo + t01 * span);
                    return (
                        <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <LiveControlLabel party={party}>{label}</LiveControlLabel>
                                <span className="tabular-nums text-muted-foreground">
                                    {isOff ? "—" : byteVal}
                                </span>
                            </div>
                            <Slider
                                min={lo}
                                max={hi}
                                step={1}
                                value={[isOff ? lo : byteVal]}
                                onValueChange={([v]) => {
                                    const byte = Math.round(v ?? lo);
                                    const next01 = span === 0 ? 0 : (byte - lo) / span;
                                    patch({
                                        activeSliderIdx: idx,
                                        buttonSlotIdx: -1,
                                        within01: next01,
                                        slotIdx: idx,
                                    });
                                }}
                                disabled={disabled || isOff}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    if (widget === "buttons" && entries.length > 0) {
        return (
            <div className="space-y-2">
                {labelRow}
                <div className={cn("flex flex-wrap gap-1.5", disabled && "pointer-events-none opacity-60")}>
                    {entries.map((entry, idx) => {
                        const active = st.slotIdx === idx;
                        const label = entry.label?.trim() || `Slot ${idx + 1}`;
                        return (
                            <Button
                                key={idx}
                                type="button"
                                size="sm"
                                variant={active ? "default" : "outline"}
                                className={cn("h-auto max-w-full whitespace-normal py-1 text-left", compact && "text-xs")}
                                onClick={() => patch({slotIdx: idx})}
                                disabled={disabled}
                            >
                                {label}
                            </Button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (widget === "slotSlider" && entries.length > 0) {
        const maxIdx = Math.max(0, entries.length - 1);
        const isFrost = channel.type === "frost";
        return (
            <div className="space-y-2">
                {labelRow}
                {isFrost && (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={(st.frostCurve ?? "linear") === "linear" ? "secondary" : "outline"}
                            onClick={() => patch({frostCurve: "linear"})}
                            disabled={disabled}
                        >
                            Linear
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={st.frostCurve === "pulse" ? "secondary" : "outline"}
                            onClick={() => patch({frostCurve: "pulse"})}
                            disabled={disabled}
                        >
                            Pulse
                        </Button>
                    </div>
                )}
                {isFrost ? (
                    <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[st.linear01 * 100]}
                        onValueChange={([v]) => patch({linear01: (v ?? 0) / 100})}
                        disabled={disabled}
                    />
                ) : (
                    <>
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{entries[Math.min(st.slotIdx, maxIdx)]?.label ?? `Slot ${st.slotIdx + 1}`}</span>
                            <span>
                                {st.slotIdx + 1} / {entries.length}
                            </span>
                        </div>
                        <Slider
                            min={0}
                            max={maxIdx}
                            step={1}
                            value={[Math.min(st.slotIdx, maxIdx)]}
                            onValueChange={([v]) => patch({slotIdx: Math.round(v ?? 0)})}
                            disabled={disabled}
                        />
                        <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[st.within01 * 100]}
                            onValueChange={([v]) => patch({within01: (v ?? 0) / 100})}
                            disabled={disabled}
                        />
                    </>
                )}
            </div>
        );
    }

    // slider (default)
    const min = typeof props?.min === "number" ? props.min : 0;
    const max = typeof props?.max === "number" ? props.max : 255;
    const isDeg = isDegreeSliderChannel(channel);
    const maxPan = Math.max(0, Math.round(fixture.movingHead?.maxPan ?? 540));
    const maxTilt = Math.max(0, Math.round(fixture.movingHead?.maxTilt ?? 270));
    const labelMode = readLiveSliderLabelMode(props, channel);
    const span = max - min;
    const useDmxSteps = !isDeg && labelMode === "dmx";
    const useDegreeSteps = isDeg;
    const sliderMin = useDmxSteps ? min : useDegreeSteps ? 0 : 0;
    const sliderMax = useDmxSteps ? max : useDegreeSteps ? (channel.type === "tilt" || channel.type === "infiniteTilt" ? maxTilt : maxPan) : 100;
    const sliderValue = useDmxSteps
        ? outputByte
        : useDegreeSteps
          ? Math.round(
                st.linear01 *
                    (channel.type === "tilt" || channel.type === "infiniteTilt" ? maxTilt : maxPan),
            )
          : Math.round(st.linear01 * 100);
    const valueLabel = isDeg
        ? channel.type === "tilt" || channel.type === "infiniteTilt"
            ? `${Math.round(st.linear01 * maxTilt)}°`
            : `${Math.round(st.linear01 * maxPan)}°`
        : labelMode === "percent"
          ? `${Math.round(st.linear01 * 100)}%`
          : `${outputByte}`;

    return (
        <div className="space-y-2">
            <div className={cn("flex justify-between gap-2", compact ? "text-xs" : "text-sm")}>
                <LiveControlLabel party={party} className={compact ? "text-xs" : undefined}>
                    {title}
                </LiveControlLabel>
                <span className="shrink-0 tabular-nums text-muted-foreground">{valueLabel}</span>
            </div>
            <Slider
                min={sliderMin}
                max={sliderMax}
                step={1}
                value={[sliderValue]}
                onValueChange={([v]) => {
                    const raw = Math.round(v ?? sliderMin);
                    if (useDmxSteps) {
                        patch({linear01: span === 0 ? 0 : (raw - min) / span});
                        return;
                    }
                    if (useDegreeSteps) {
                        const degMax =
                            channel.type === "tilt" || channel.type === "infiniteTilt" ? maxTilt : maxPan;
                        patch({linear01: degMax === 0 ? 0 : raw / degMax});
                        return;
                    }
                    patch({linear01: (raw ?? 0) / 100});
                }}
                disabled={disabled}
            />
            {!compact && (min !== 0 || max !== 255) ? (
                <p className="text-[10px] text-muted-foreground">
                    DMX {min}–{max}
                </p>
            ) : null}
        </div>
    );
}

export function liveWidgetPreviewLine(ch: DMXChannel): string {
    const w = resolveLiveWidget(ch);
    if (w === "hidden") {
        const source = liveWidgetHiddenSource(ch);
        if (source === "override") {
            return "Not shown on live tab (Live control = Hidden).";
        }
        if (source === "inferred") {
            return "Not shown on live tab (Auto: fine/aux channel or no live mapping).";
        }
        return "Not shown on live tab.";
    }
    const entries = parseFixtureEntries(ch.properties as JSONMap | undefined);
    if (w === "buttons" && entries.length > 0) {
        return `Live tab: Buttons (${entries.length} slots)`;
    }
    if (w === "slotSlider" && entries.length > 0) {
        return `Live tab: Slot slider (${entries.length} slots)`;
    }
    if (w === "buttonSlider" && entries.length > 0) {
        const kinds = parseEntryLiveSlotKinds(ch.properties as JSONMap | undefined, entries);
        const buttons = kinds.filter((k) => k === "button").length;
        const sliders = kinds.filter((k) => k === "slider").length;
        return `Live tab: Switch + slider (${buttons} switch${buttons === 1 ? "" : "es"}, ${sliders} slider${sliders === 1 ? "" : "s"})`;
    }
    if (w === "slider" && !isDegreeSliderChannel(ch)) {
        const props = ch.properties as JSONMap | undefined;
        const mode = readLiveSliderLabelMode(props, ch);
        return `Live tab: Slider (value label: ${liveSliderLabelModeHint(mode)})`;
    }
    return `Live tab: ${w === "shutterModes" ? "Shutter modes" : w.charAt(0).toUpperCase() + w.slice(1)}`;
}

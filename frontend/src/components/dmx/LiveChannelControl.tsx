import type {ReactNode} from "react";
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
    readLiveSliderOrientation,
    resolveLiveWidget,
    type LiveSlotKind,
} from "@/lib/dmxLiveWidget.ts";
import {channelIncludedInParty} from "@/lib/dmxPartyInclude.ts";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {
    defaultScrollWithin01,
    inferScrollRamp,
    isColorWheelScrollSlot,
    scrollRangeSlowFastDmx,
    scrollSlotDmxByte,
    scrollVelocityLiveLabels,
} from "@/lib/colorWheelSlot";
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

/** A single labelled vertical (fader-style) slider that fills the height of its container. */
function VerticalFader({
    label,
    valueLabel,
    min,
    max,
    step = 1,
    value,
    onValueChange,
    disabled,
}: {
    label?: ReactNode;
    valueLabel?: ReactNode;
    min: number;
    max: number;
    step?: number;
    value: number;
    onValueChange: (v: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-1">
            {label != null ? (
                <div className="w-full truncate text-center text-xs text-muted-foreground">{label}</div>
            ) : null}
            <div className="flex min-h-0 w-full flex-1 justify-center py-1">
                <Slider
                    orientation="vertical"
                    min={min}
                    max={max}
                    step={step}
                    value={[value]}
                    onValueChange={([v]) => onValueChange(v ?? min)}
                    disabled={disabled}
                    className="h-full"
                />
            </div>
            {valueLabel != null ? (
                <span className="text-center text-xs tabular-nums text-muted-foreground">{valueLabel}</span>
            ) : null}
        </div>
    );
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
    const vertical = readLiveSliderOrientation(props) === "vertical";

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
        const slotIdx = Math.min(st.slotIdx, max);
        const activeEntry = entries[slotIdx];
        const scrollActive = isColorWheelScrollSlot(activeEntry);
        const ramp = scrollActive ? inferScrollRamp(activeEntry) : "fastToSlow";
        const velLabels = scrollVelocityLiveLabels();
        const slowFast = scrollActive
            ? scrollRangeSlowFastDmx(activeEntry, ramp)
            : {slow: 0, fast: 255};
        const velByte = scrollActive ? scrollSlotDmxByte(activeEntry, st.within01, ramp) : outputByte;
        return (
            <div className="space-y-2">
                {labelRow}
                <div className="flex justify-center">
                    <ColorWheelSegmentControl
                        entries={entries}
                        value={slotIdx}
                        onChange={(idx) => {
                            const entry = entries[idx];
                            if (isColorWheelScrollSlot(entry)) {
                                patch({slotIdx: idx, within01: defaultScrollWithin01()});
                            } else {
                                patch({slotIdx: idx, within01: 0});
                            }
                        }}
                        disabled={disabled}
                    />
                </div>
                {scrollActive ? (
                    <div className="space-y-1 rounded-md border border-border/80 bg-muted/30 px-2 py-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                                {velLabels.left}{" "}
                                <span className="text-muted-foreground/80">({slowFast.slow})</span>
                            </span>
                            <span className="tabular-nums">{velByte}</span>
                            <span>
                                {velLabels.right}{" "}
                                <span className="text-muted-foreground/80">({slowFast.fast})</span>
                            </span>
                        </div>
                        <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[Math.round(st.within01 * 100)]}
                            onValueChange={([v]) => patch({slotIdx, within01: (v ?? 0) / 100})}
                            disabled={disabled}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    if (widget === "goboWheel" && entries.length > 0) {
        const max = Math.max(0, entries.length - 1);
        return (
            <div className="space-y-2">
                {labelRow}
                <div className="flex justify-center">
                    <GoboWheelSegmentControl
                        entries={entries}
                        value={Math.min(st.slotIdx, max)}
                        onChange={(idx) => patch({slotIdx: idx})}
                        disabled={disabled}
                    />
                </div>
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

        const slotLabel = (idx: number) => entries[idx]?.label?.trim() || `Slot ${idx + 1}`;

        const onSwitchChange = (idx: number, nextChecked: boolean) => {
            if (offIdx >= 0 && idx === offIdx) {
                if (!nextChecked) {
                    patch({buttonSlotIdx: offIdx, slotIdx: offIdx, within01: 0});
                    return;
                }
                const fallbackSlider = firstSliderSlotIndex(kinds);
                const nextSliderIdx = sliderIdx >= 0 ? sliderIdx : fallbackSlider;
                if (nextSliderIdx >= 0) {
                    patch({activeSliderIdx: nextSliderIdx, buttonSlotIdx: -1, slotIdx: nextSliderIdx, within01: st.within01});
                } else {
                    patch({buttonSlotIdx: -1, slotIdx: idx, within01: 0});
                }
                return;
            }
            if (nextChecked) {
                patch({buttonSlotIdx: idx, slotIdx: idx, within01: 0});
                return;
            }
            if (offIdx >= 0) {
                patch({buttonSlotIdx: offIdx, slotIdx: offIdx, within01: 0});
                return;
            }
            const fallbackSlider = firstSliderSlotIndex(kinds);
            if (fallbackSlider >= 0) {
                patch({activeSliderIdx: fallbackSlider, buttonSlotIdx: -1, slotIdx: fallbackSlider, within01: st.within01});
            } else {
                patch({buttonSlotIdx: -1, within01: 0});
            }
        };

        const renderSwitch = (idx: number) => {
            const active = buttonSlot === idx;
            const checked = offIdx >= 0 && idx === offIdx ? !isOff : active;
            return (
                <div key={`sw-${idx}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <LiveControlLabel party={party} className="text-xs">
                        {offIdx >= 0 && idx === offIdx ? "Output enabled" : slotLabel(idx)}
                    </LiveControlLabel>
                    <Switch
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(nextChecked) => onSwitchChange(idx, nextChecked)}
                    />
                </div>
            );
        };

        const sliderSlot = (idx: number) => {
            const entry = entries[idx];
            const showSlider = sliderIdx === idx;
            const t01 = showSlider ? st.within01 : 0;
            const lo = Math.min(entry.from, entry.to);
            const hi = Math.max(entry.from, entry.to);
            const span = hi - lo;
            const byteVal = Math.round(lo + t01 * span);
            const onChange = (v: number) => {
                const byte = Math.round(v);
                const next01 = span === 0 ? 0 : (byte - lo) / span;
                patch({activeSliderIdx: idx, buttonSlotIdx: -1, within01: next01, slotIdx: idx});
            };
            return {lo, hi, byteVal, onChange};
        };

        const slotKind = (idx: number): LiveSlotKind => kinds[idx] ?? "button";
        const buttonIdxs = entries.map((_, i) => i).filter((i) => slotKind(i) === "button");
        const sliderIdxs = entries.map((_, i) => i).filter((i) => slotKind(i) === "slider");

        if (vertical) {
            return (
                <div className="flex h-full min-h-0 flex-col gap-2">
                    {labelRow}
                    {buttonIdxs.length > 0 ? (
                        <div className="space-y-2">{buttonIdxs.map(renderSwitch)}</div>
                    ) : null}
                    {sliderIdxs.length > 0 ? (
                        <div className="flex min-h-0 flex-1 items-stretch gap-3">
                            {sliderIdxs.map((idx) => {
                                const {lo, hi, byteVal, onChange} = sliderSlot(idx);
                                return (
                                    <VerticalFader
                                        key={`fd-${idx}`}
                                        label={slotLabel(idx)}
                                        valueLabel={isOff ? "—" : byteVal}
                                        min={lo}
                                        max={hi}
                                        value={isOff ? lo : byteVal}
                                        onValueChange={onChange}
                                        disabled={disabled || isOff}
                                    />
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {labelRow}
                {entries.map((_entry, idx) => {
                    if (slotKind(idx) === "button") {
                        return renderSwitch(idx);
                    }
                    const {lo, hi, byteVal, onChange} = sliderSlot(idx);
                    return (
                        <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <LiveControlLabel party={party}>{slotLabel(idx)}</LiveControlLabel>
                                <span className="tabular-nums text-muted-foreground">
                                    {isOff ? "—" : byteVal}
                                </span>
                            </div>
                            <Slider
                                min={lo}
                                max={hi}
                                step={1}
                                value={[isOff ? lo : byteVal]}
                                onValueChange={([v]) => onChange(v ?? lo)}
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
        const activeSlotIdx = Math.min(st.slotIdx, maxIdx);
        const slotPickerLabel = entries[activeSlotIdx]?.label ?? `Slot ${st.slotIdx + 1}`;
        const frostModeButtons = isFrost ? (
            <div className={cn("flex flex-wrap gap-2", vertical && "justify-center")}>
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
        ) : null;

        if (vertical) {
            return (
                <div className="flex h-full min-h-0 flex-col gap-2">
                    {labelRow}
                    {frostModeButtons}
                    {isFrost ? (
                        <div className="flex min-h-0 flex-1 items-stretch">
                            <VerticalFader
                                min={0}
                                max={100}
                                value={Math.round(st.linear01 * 100)}
                                valueLabel={`${Math.round(st.linear01 * 100)}%`}
                                onValueChange={(v) => patch({linear01: v / 100})}
                                disabled={disabled}
                            />
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 items-stretch gap-3">
                            <VerticalFader
                                label="Slot"
                                min={0}
                                max={maxIdx}
                                value={activeSlotIdx}
                                valueLabel={`${activeSlotIdx + 1}/${entries.length}`}
                                onValueChange={(v) => patch({slotIdx: Math.round(v)})}
                                disabled={disabled}
                            />
                            <VerticalFader
                                label={slotPickerLabel}
                                min={0}
                                max={100}
                                value={Math.round(st.within01 * 100)}
                                valueLabel={`${Math.round(st.within01 * 100)}%`}
                                onValueChange={(v) => patch({within01: v / 100})}
                                disabled={disabled}
                            />
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-2">
                {labelRow}
                {frostModeButtons}
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
                            <span>{slotPickerLabel}</span>
                            <span>
                                {st.slotIdx + 1} / {entries.length}
                            </span>
                        </div>
                        <Slider
                            min={0}
                            max={maxIdx}
                            step={1}
                            value={[activeSlotIdx]}
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

    const onSliderChange = ([v]: number[]) => {
        const raw = Math.round(v ?? sliderMin);
        if (useDmxSteps) {
            patch({linear01: span === 0 ? 0 : (raw - min) / span});
            return;
        }
        if (useDegreeSteps) {
            const degMax = channel.type === "tilt" || channel.type === "infiniteTilt" ? maxTilt : maxPan;
            patch({linear01: degMax === 0 ? 0 : raw / degMax});
            return;
        }
        patch({linear01: (raw ?? 0) / 100});
    };
    const dmxHint =
        !compact && (min !== 0 || max !== 255) ? (
            <p className="text-[10px] text-muted-foreground">
                DMX {min}–{max}
            </p>
        ) : null;

    if (vertical) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <LiveControlLabel party={party} className={cn("justify-center", compact ? "text-xs" : "text-sm")}>
                    {title}
                </LiveControlLabel>
                <div className="flex min-h-0 flex-1 justify-center py-1">
                    <Slider
                        orientation="vertical"
                        min={sliderMin}
                        max={sliderMax}
                        step={1}
                        value={[sliderValue]}
                        onValueChange={onSliderChange}
                        disabled={disabled}
                        className="h-full"
                    />
                </div>
                <span className="shrink-0 text-center tabular-nums text-muted-foreground">{valueLabel}</span>
                {dmxHint}
            </div>
        );
    }

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
                onValueChange={onSliderChange}
                disabled={disabled}
            />
            {dmxHint}
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
    const orient = readLiveSliderOrientation(ch.properties as JSONMap | undefined) === "vertical" ? "vertical" : "horizontal";
    if (w === "buttons" && entries.length > 0) {
        return `Live tab: Buttons (${entries.length} slots)`;
    }
    if (w === "slotSlider" && entries.length > 0) {
        return `Live tab: Slot slider (${entries.length} slots, ${orient})`;
    }
    if (w === "buttonSlider" && entries.length > 0) {
        const kinds = parseEntryLiveSlotKinds(ch.properties as JSONMap | undefined, entries);
        const buttons = kinds.filter((k) => k === "button").length;
        const sliders = kinds.filter((k) => k === "slider").length;
        return `Live tab: Switch + slider (${buttons} switch${buttons === 1 ? "" : "es"}, ${sliders} slider${sliders === 1 ? "" : "s"}${sliders > 0 ? `, ${orient}` : ""})`;
    }
    if (w === "slider") {
        const props = ch.properties as JSONMap | undefined;
        const label = orient === "vertical" ? "vertical fader" : "horizontal";
        if (isDegreeSliderChannel(ch)) {
            return `Live tab: Slider (${label})`;
        }
        const mode = readLiveSliderLabelMode(props, ch);
        return `Live tab: Slider (${label}, value label: ${liveSliderLabelModeHint(mode)})`;
    }
    if (w === "colorWheel" && entries.length > 0) {
        const scrollCount = entries.filter((e) => isColorWheelScrollSlot(e)).length;
        if (scrollCount > 0) {
            return `Live tab: Color wheel (${entries.length} slots, ${scrollCount} with speed slider)`;
        }
    }
    return `Live tab: ${w === "shutterModes" ? "Shutter modes" : w.charAt(0).toUpperCase() + w.slice(1)}`;
}

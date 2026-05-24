import type {DMXPartyAudioFeatures} from "@/types/controller.ts";
import {cn} from "@/lib/utils";

type PartyAudioEqualizerProps = {
    audio: DMXPartyAudioFeatures;
    className?: string;
};

const BANDS: {key: keyof DMXPartyAudioFeatures; label: string; color: string}[] = [
    {key: "level", label: "Level", color: "bg-violet-500"},
    {key: "bass", label: "Bass", color: "bg-rose-500"},
    {key: "mid", label: "Mid", color: "bg-amber-500"},
    {key: "treble", label: "Treble", color: "bg-sky-500"},
    {key: "beat", label: "Beat", color: "bg-emerald-500"},
];

function bandValue(audio: DMXPartyAudioFeatures, key: keyof DMXPartyAudioFeatures): number {
    const raw = audio[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return 0;
    }
    return Math.max(0, Math.min(1, raw));
}

export function PartyAudioEqualizer({audio, className}: PartyAudioEqualizerProps) {
    return (
        <div
            className={cn("flex items-end justify-center gap-3 rounded-md border bg-muted/30 px-4 py-3", className)}
            aria-label="Audio level equalizer"
        >
            {BANDS.map(({key, label, color}) => {
                const value = bandValue(audio, key);
                const heightPct = Math.max(4, Math.round(value * 100));
                return (
                    <div key={key} className="flex min-w-[2.5rem] flex-col items-center gap-1">
                        <div className="flex h-28 w-8 items-end justify-center rounded-sm bg-background/80 p-0.5">
                            <div
                                className={cn("w-full rounded-sm transition-[height] duration-75 ease-out", color)}
                                style={{height: `${heightPct}%`}}
                            />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                            {Math.round(value * 100)}%
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

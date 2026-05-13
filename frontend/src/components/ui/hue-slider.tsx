import {useEffect, useRef} from "react";
import {Slider} from "@/components/ui/slider";

type HueSliderProps = {
    value: number;
    disabled?: boolean;
    onChange: (nextHue: number) => void;
};

export function HueSlider({value, disabled, onChange}: HueSliderProps) {
    const huePendingRef = useRef<number | null>(null);
    const hueRafRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (hueRafRef.current !== null) {
                window.cancelAnimationFrame(hueRafRef.current);
                hueRafRef.current = null;
            }
        };
    }, []);

    return (
        <div className="space-y-2">
            <Slider
                min={0}
                max={360}
                step={1}
                value={[value]}
                className="hue-slider"
                onValueChange={(nextValue) => {
                    const nextHue = nextValue[0] ?? 0;
                    huePendingRef.current = nextHue;
                    if (hueRafRef.current !== null) return;
                    hueRafRef.current = window.requestAnimationFrame(() => {
                        hueRafRef.current = null;
                        const pendingHue = huePendingRef.current;
                        if (pendingHue === null) return;
                        huePendingRef.current = null;
                        onChange(pendingHue);
                    });
                }}
                disabled={disabled}
            />
            <style>{`.hue-slider [data-slot="slider-track"]{background:linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)} .hue-slider [data-slot="slider-range"]{background: transparent}`}</style>
        </div>
    );
}

import {Button} from "@/components/ui/button.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {useWindowDisplayState} from "@/hooks/useWindowDisplayState.ts";
import {PiArrowsOutSimple, PiCornersOut} from "react-icons/pi";

type WindowDisplayCardProps = {
    disabled?: boolean;
};

export function WindowDisplayCard({disabled = false}: WindowDisplayCardProps) {
    const {
        available,
        fullscreen,
        maximised,
        busy,
        toggleFullscreen,
        toggleMaximised,
    } = useWindowDisplayState();

    if (!available) {
        return null;
    }

    const controlsDisabled = disabled || busy;

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">Window display</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm opacity-70">
                    Expand the application window for stage use or kiosk-style displays.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant={fullscreen ? "default" : "outline"}
                        disabled={controlsDisabled}
                        onClick={() => void toggleFullscreen()}
                    >
                        <PiArrowsOutSimple/>
                        {fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    </Button>
                    <Button
                        size="sm"
                        variant={maximised ? "default" : "outline"}
                        disabled={controlsDisabled}
                        onClick={() => void toggleMaximised()}
                    >
                        <PiCornersOut/>
                        {maximised ? "Restore window" : "Maximize window"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

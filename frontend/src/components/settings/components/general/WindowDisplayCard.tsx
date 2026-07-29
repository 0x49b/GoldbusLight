import {Button} from "@/components/ui/button.tsx";
import {useWindowDisplayState} from "@/hooks/useWindowDisplayState.ts";
import {PiArrowsOutSimple, PiCornersOut} from "react-icons/pi";
import {useTranslation} from "react-i18next";

type WindowDisplayCardProps = {
    disabled?: boolean;
};

export function WindowDisplayCard({disabled = false}: WindowDisplayCardProps) {
    const {t} = useTranslation("settings");
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
        <div className="flex flex-col gap-1.5">
            <label htmlFor="language-preference" className="text-sm font-medium">
                {t("window.title")}
            </label>
            <div className="flex flex-wrap gap-3">
                <Button
                    size="sm"
                    variant={fullscreen ? "default" : "outline"}
                    disabled={controlsDisabled}
                    onClick={() => void toggleFullscreen()}
                >
                    <PiArrowsOutSimple/>
                    {fullscreen ? t("window.exitFullscreen") : t("window.enterFullscreen")}
                </Button>
                <Button
                    size="sm"
                    variant={maximised ? "default" : "outline"}
                    disabled={controlsDisabled}
                    onClick={() => void toggleMaximised()}
                >
                    <PiCornersOut/>
                    {maximised ? t("window.restore") : t("window.maximize")}
                </Button>
            </div>
        </div>
    );
}

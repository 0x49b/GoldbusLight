import {useEffect, useRef} from "react";
import {PiWarning, PiX} from "react-icons/pi";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";

const AUTO_DISMISS_MS = 5000;

type AppErrorBannerProps = {
    error: string;
    onDismiss: () => void;
};

export function AppErrorBanner({error, onDismiss}: AppErrorBannerProps) {
    const hoveredRef = useRef(false);
    const pendingDismissRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        hoveredRef.current = false;
        pendingDismissRef.current = false;

        const clearTimer = () => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const dismissIfNotHovered = () => {
            timerRef.current = null;
            if (hoveredRef.current) {
                pendingDismissRef.current = true;
                return;
            }
            onDismiss();
        };

        clearTimer();
        timerRef.current = window.setTimeout(dismissIfNotHovered, AUTO_DISMISS_MS);

        return clearTimer;
    }, [error, onDismiss]);

    return (
        <Alert
            variant="destructive"
            role="alert"
            className="pointer-events-auto absolute inset-x-0 top-0 z-[100] w-full rounded-none border-x-0 border-t-0 border-b border-destructive/40 bg-destructive/15 text-destructive shadow-lg px-4 py-3 md:px-6 *:data-[slot=alert-description]:text-destructive/90"
            onMouseEnter={() => {
                hoveredRef.current = true;
            }}
            onMouseLeave={() => {
                hoveredRef.current = false;
                if (pendingDismissRef.current) {
                    pendingDismissRef.current = false;
                    onDismiss();
                }
            }}
        >
            <PiWarning className="size-4" aria-hidden/>
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="pr-10 break-words">
                {error.replace(/^Error:\s*/i, "")}
            </AlertDescription>
            <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="absolute top-2 right-2 shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
                aria-label="Dismiss error"
                onClick={onDismiss}
            >
                <PiX className="size-4" aria-hidden/>
            </Button>
        </Alert>
    );
}

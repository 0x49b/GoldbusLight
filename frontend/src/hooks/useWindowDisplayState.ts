import {Events, Window} from "@wailsio/runtime";
import {useCallback, useEffect, useState} from "react";

type WindowDisplayState = {
    available: boolean;
    fullscreen: boolean;
    maximised: boolean;
    busy: boolean;
    toggleFullscreen: () => Promise<void>;
    toggleMaximised: () => Promise<void>;
};

async function readWindowDisplayState(): Promise<{fullscreen: boolean; maximised: boolean} | null> {
    try {
        const [fullscreen, maximised] = await Promise.all([
            Window.IsFullscreen(),
            Window.IsMaximised(),
        ]);
        return {fullscreen, maximised};
    } catch {
        return null;
    }
}

export function useWindowDisplayState(): WindowDisplayState {
    const [available, setAvailable] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [maximised, setMaximised] = useState(false);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const next = await readWindowDisplayState();
        if (!next) {
            setAvailable(false);
            return;
        }
        setAvailable(true);
        setFullscreen(next.fullscreen);
        setMaximised(next.maximised);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!available) {
            return;
        }

        const unsubscribers = [
            Events.On("common:WindowFullscreen", () => setFullscreen(true)),
            Events.On("common:WindowUnFullscreen", () => setFullscreen(false)),
            Events.On("common:WindowMaximise", () => setMaximised(true)),
            Events.On("common:WindowUnMaximise", () => setMaximised(false)),
        ];

        return () => {
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
        };
    }, [available]);

    const toggleFullscreen = useCallback(async () => {
        if (!available || busy) {
            return;
        }
        setBusy(true);
        try {
            if (fullscreen) {
                await Window.UnFullscreen();
            } else {
                await Window.Fullscreen();
            }
            await refresh();
        } finally {
            setBusy(false);
        }
    }, [available, busy, fullscreen, refresh]);

    const toggleMaximised = useCallback(async () => {
        if (!available || busy) {
            return;
        }
        setBusy(true);
        try {
            if (maximised) {
                await Window.UnMaximise();
            } else {
                await Window.Maximise();
            }
            await refresh();
        } finally {
            setBusy(false);
        }
    }, [available, busy, maximised, refresh]);

    return {
        available,
        fullscreen,
        maximised,
        busy,
        toggleFullscreen,
        toggleMaximised,
    };
}

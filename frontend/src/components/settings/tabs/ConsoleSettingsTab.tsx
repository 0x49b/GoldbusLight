import type {ConsoleEntry} from "@/types/controller.ts";
import {TransportConsolePanel} from "./TransportConsolePanel.tsx";

export type ConsoleSettingsTabProps = {
    entries: ConsoleEntry[];
    onClear: () => void;
    onToggleDetach: () => void;
};

export function ConsoleSettingsTab({
    entries,
    onClear,
    onToggleDetach,
}: ConsoleSettingsTabProps) {
    return (
        <div className="space-y-5">
            <TransportConsolePanel
                entries={entries}
                onClear={onClear}
                onToggleDetach={onToggleDetach}
                detached={false}
            />
        </div>
    );
}

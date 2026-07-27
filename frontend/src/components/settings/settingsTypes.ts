import type {ControllerSettings} from "@/types/controller.ts";

export type SettingsUpdateMode = "debounced" | "immediate";

export type SettingsUpdater = (
    updater: ControllerSettings | ((previous: ControllerSettings | null) => ControllerSettings | null),
    mode?: SettingsUpdateMode,
) => void;

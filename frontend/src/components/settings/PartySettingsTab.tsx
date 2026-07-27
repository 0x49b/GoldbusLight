import {PartyModeView} from "@/components/party/PartyModeView";
import type {
    DMXFixture,
    DMXPartyAudioInputDevice,
    DMXPartyConfig,
    DMXPartyState,
    WLEDDevice,
} from "@/types/controller.ts";

export type PartySettingsTabProps = {
    fixtures: DMXFixture[];
    wledDevices: WLEDDevice[];
    party: DMXPartyState;
    busy: boolean;
    audioInputDevices: DMXPartyAudioInputDevice[];
    onRefreshAudioDevices: () => Promise<void>;
    onUpdateConfig: (partial: Partial<DMXPartyConfig>) => Promise<boolean>;
    onStart: () => Promise<boolean>;
    onStop: () => Promise<void>;
};

export function PartySettingsTab({
    fixtures,
    wledDevices,
    party,
    busy,
    audioInputDevices,
    onRefreshAudioDevices,
    onUpdateConfig,
    onStart,
    onStop,
}: PartySettingsTabProps) {
    return (
        <div className="space-y-5">
            <PartyModeView
                fixtures={fixtures}
                wledDevices={wledDevices}
                party={party}
                busy={busy}
                audioInputDevices={audioInputDevices}
                onRefreshAudioDevices={onRefreshAudioDevices}
                onUpdateConfig={onUpdateConfig}
                onStart={onStart}
                onStop={onStop}
            />
        </div>
    );
}

import type {DMXPartyChannelGroup, DMXPartyConfig} from "@/types/controller.ts";

export const PARTY_CHANNEL_GROUPS: ReadonlyArray<{
    id: DMXPartyChannelGroup;
    label: string;
    description: string;
}> = [
    {id: "movement", label: "Movement", description: "Pan, tilt, motor speed"},
    {id: "color", label: "Color", description: "Color wheel and RGB mix"},
    {id: "gobo", label: "Gobo", description: "Gobo wheel, indexing, rotation"},
    {id: "beam", label: "Beam", description: "Dimmer, shutter, zoom, focus, iris, frost"},
    {id: "effects", label: "Effects", description: "Prism and prism rotation"},
];

export function partyChannelGroupEnabled(
    config: DMXPartyConfig,
    group: DMXPartyChannelGroup,
): boolean {
    const groups = config.channelGroups;
    if (!groups) {
        return true;
    }
    const value = groups[group];
    return value !== false;
}

export function togglePartyChannelGroup(
    config: DMXPartyConfig,
    group: DMXPartyChannelGroup,
    enabled: boolean,
): Partial<DMXPartyConfig> {
    return {
        channelGroups: {
            ...config.channelGroups,
            [group]: enabled,
        },
    };
}

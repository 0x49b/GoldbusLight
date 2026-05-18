import type {DMXChannelType, DMXFixture, JSONMap} from "../types/controller";
import type {DMXLiveControlState} from "./dmxLiveMap";

function firstChannel(channels: DMXFixture["channels"], type: DMXChannelType) {
    return channels.find((c) => c.type === type);
}

function dmxChannelAddress(fixture: DMXFixture, channelOffset: number): number | null {
    const base = fixture.dmxAddress;
    if (!Number.isFinite(base) || base < 1 || base > 512) {
        return null;
    }
    const addr = Math.round(base) + channelOffset - 1;
    if (addr < 1 || addr > 512) {
        return null;
    }
    return addr;
}

function universeValue(universe: number[] | undefined, addr: number): number | undefined {
    if (!universe || universe.length < 512 || addr < 1 || addr > 512) {
        return undefined;
    }
    const v = universe[addr - 1];
    if (typeof v !== "number" || !Number.isFinite(v)) {
        return undefined;
    }
    return Math.max(0, Math.min(255, Math.round(v)));
}

export function byteTo01(value: number, props: JSONMap | undefined): number {
    const min = typeof props?.min === "number" ? props.min : 0;
    const max = typeof props?.max === "number" ? props.max : 255;
    const v = Math.max(0, Math.min(255, value));
    if (max === min) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

export type FixturePreviewDrive = {
    pan01: number;
    tilt01: number;
    dimmer01: number;
};

export function fixturePreviewDrive(
    fixture: DMXFixture,
    universe: number[] | undefined,
    fallback: DMXLiveControlState,
): FixturePreviewDrive {
    const panCh = firstChannel(fixture.channels, "pan");
    const tiltCh = firstChannel(fixture.channels, "tilt");
    const dimCh = firstChannel(fixture.channels, "dimmer");
    const fogCh = firstChannel(fixture.channels, "fog");

    let pan01 = fallback.pan01;
    let tilt01 = fallback.tilt01;
    let dimmer01 = fallback.dimmer01;

    if (universe && universe.length >= 512) {
        if (panCh && Number.isFinite(panCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(panCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                pan01 = byteTo01(raw, panCh.properties as JSONMap);
            }
        }
        if (tiltCh && Number.isFinite(tiltCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(tiltCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                tilt01 = byteTo01(raw, tiltCh.properties as JSONMap);
            }
        }
        if (dimCh && Number.isFinite(dimCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(dimCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                dimmer01 = byteTo01(raw, dimCh.properties as JSONMap);
            }
        } else if (fogCh && Number.isFinite(fogCh.channel)) {
            const addr = dmxChannelAddress(fixture, Math.round(fogCh.channel));
            const raw = addr != null ? universeValue(universe, addr) : undefined;
            if (raw !== undefined) {
                dimmer01 = byteTo01(raw, fogCh.properties as JSONMap);
            }
        }
    }

    return {pan01, tilt01, dimmer01};
}

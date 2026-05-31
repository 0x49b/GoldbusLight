import type {DMXFixture, DMXFixturePreset} from "@/types/controller.ts";
import {
    buildDmxLivePatch,
    defaultDmxLiveControlState,
    defaultEntryStateForChannel,
    parseFixtureEntries,
    type DMXLiveControlState,
} from "./dmxLiveMap.ts";

/**
 * A high-level moving-head "pose" expressed as normalised pan/tilt (0..1, where 0.5 ≈ centre).
 * These are turned into concrete DMX bytes per fixture by reading each channel's type, so the
 * same show works for any moving head regardless of its channel order.
 */
type ShowPose = {
    label: string;
    pan01: number;
    tilt01: number;
};

/**
 * Ten classic DJ/club moving-head looks. Chained with a crossfade they read as a smooth show:
 * a home base, an audience wash, left/right sweeps, crossing beams, a sky search, a floor spot,
 * and wide diagonals. Pan/tilt directions depend on rigging, so these are sane starting points
 * the user can fine-tune per pose afterwards.
 */
const SHOW_POSES: ShowPose[] = [
    {label: "Home Center", pan01: 0.5, tilt01: 0.55},
    {label: "Audience Wash", pan01: 0.5, tilt01: 0.35},
    {label: "Sweep Left", pan01: 0.18, tilt01: 0.55},
    {label: "Sweep Right", pan01: 0.82, tilt01: 0.55},
    {label: "Cross Beam Left", pan01: 0.4, tilt01: 0.72},
    {label: "Cross Beam Right", pan01: 0.6, tilt01: 0.72},
    {label: "Sky Search", pan01: 0.5, tilt01: 0.92},
    {label: "Floor Spot", pan01: 0.5, tilt01: 0.15},
    {label: "Wide Diagonal Left", pan01: 0.22, tilt01: 0.8},
    {label: "Wide Diagonal Right", pan01: 0.78, tilt01: 0.8},
];

const PAN_TYPES = new Set<string>(["pan", "infinitePan"]);
const TILT_TYPES = new Set<string>(["tilt", "infiniteTilt"]);
const DIMMER_TYPES = new Set<string>(["dimmer", "dimmerFine"]);

/** True when the fixture has any pan or tilt channel (i.e. a generated show makes sense). */
export function fixtureSupportsMovingHeadShow(fixture: DMXFixture): boolean {
    return (fixture.channels ?? []).some((c) => PAN_TYPES.has(c.type) || TILT_TYPES.has(c.type));
}

/**
 * Builds 10 ready-made poses for a moving head. Each pose is rendered through the same live
 * control path the manual "Save as preset" capture uses (defaultDmxLiveControlState +
 * buildDmxLivePatch), so colour/gobo/shutter come out correct for the specific fixture and any
 * absent channel type is simply skipped.
 */
export function generateMovingHeadShow(fixture: DMXFixture): DMXFixturePreset[] {
    const base = Math.max(1, Math.round(fixture.dmxAddress || 1));
    const channels = fixture.channels ?? [];
    const stamp = Date.now().toString(36);

    return SHOW_POSES.map((pose, idx) => {
        const state: DMXLiveControlState = defaultDmxLiveControlState(fixture);
        const entryChannels = {...state.entryChannels};

        for (const ch of channels) {
            const prev = entryChannels[ch.channel] ?? defaultEntryStateForChannel(ch);
            if (PAN_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: pose.pan01};
            } else if (TILT_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: pose.tilt01};
            } else if (DIMMER_TYPES.has(ch.type)) {
                entryChannels[ch.channel] = {...prev, linear01: 1};
            } else if (ch.type === "shutterStrobe") {
                entryChannels[ch.channel] = {...prev, shutter: "open"};
            } else if (ch.type === "movementSpeed") {
                // A small, stable value keeps the motor fast so it follows the chase smoothly.
                entryChannels[ch.channel] = {...prev, linear01: 0.12};
            } else if (ch.type === "colorWheel" || ch.type === "goboWheel") {
                const n = parseFixtureEntries(ch.properties).length;
                if (n > 0) {
                    entryChannels[ch.channel] = {...prev, slotIdx: idx % n, within01: 0.5};
                }
            }
        }

        const values: Record<string, number> = {};
        for (const {address, value} of buildDmxLivePatch(fixture, {...state, entryChannels})) {
            const offset = address - base + 1;
            if (offset >= 1) {
                values[String(offset)] = value;
            }
        }
        // Master on/off and lamp channels are "hidden" in the live UI, so force them on to make
        // sure each pose actually emits light.
        for (const ch of channels) {
            if (ch.type === "onOff" || ch.type === "lamp") {
                values[String(ch.channel)] = 255;
            }
        }

        return {
            id: `preset-show-${stamp}-${idx}`,
            label: pose.label,
            values,
        };
    });
}

import type {DMXFixturePreviewVariant} from "@/components/dmx/3D/DMXFixturePreview3D.shared";
import type {DMXFixture, DMXFixtureType} from "@/types/controller";

const PAR_PREVIEW_FIXTURE_TYPES = new Set<DMXFixtureType>([
    "colorChanger",
    "dimmer",
    "other",
    "strobe",
]);

export function fixtureHas3DPreview(fixture: DMXFixture): boolean {
    return fixture.type === "movingHead"
        || fixture.type === "smoke"
        || PAR_PREVIEW_FIXTURE_TYPES.has(fixture.type);
}

export function fixturePreview3DVariant(fixture: DMXFixture): DMXFixturePreviewVariant | null {
    if (fixture.type === "smoke") {
        return "smoke";
    }
    if (fixture.type === "movingHead") {
        return "movingHead";
    }
    if (PAR_PREVIEW_FIXTURE_TYPES.has(fixture.type)) {
        return "par";
    }
    return null;
}

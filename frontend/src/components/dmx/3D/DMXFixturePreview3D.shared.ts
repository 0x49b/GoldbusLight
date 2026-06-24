import * as THREE from "three";
import type {PreviewBeamShutter} from "@/lib/dmxFixturePreviewDrive";

export type DMXFixturePreviewVariant = "movingHead" | "smoke" | "par";

export type DMXFixturePreview3DProps = {
    variant: DMXFixturePreviewVariant;
    panDeg: number;
    tiltDeg: number;
    maxPanDeg?: number;
    maxTiltDeg?: number;
    focus01?: number;
    beamColor?: string;
    beamRainbow?: boolean;
    beamShutter?: PreviewBeamShutter;
    strobeSpeed01?: number;
    intensity: number;
    disabled?: boolean;
    onPanTiltChange?: (value: { pan01: number; tilt01: number }) => void;
    /** When true, grow with the parent (e.g. live layout grid tile) instead of a fixed preview height. */
    fillGridCell?: boolean;
};

export type DMXParPreview3DProps = Pick<
    DMXFixturePreview3DProps,
    "focus01" | "beamColor" | "beamRainbow" | "beamShutter" | "strobeSpeed01" | "intensity"
>;

export type DMXMovingHeadPreview3DProps = Pick<
    DMXFixturePreview3DProps,
    "panDeg" | "tiltDeg" | "maxPanDeg" | "maxTiltDeg" | "focus01" | "beamColor" | "beamRainbow" | "beamShutter" | "strobeSpeed01" | "intensity"
>;

export type DMXSmokePreview3DProps = Pick<DMXFixturePreview3DProps, "panDeg" | "tiltDeg" | "intensity">;

export function applyOpacity(root: THREE.Object3D, opacity: number) {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) {
            return;
        }
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
        for (const m of mats) {
            m.transparent = true;
            m.opacity = opacity;
            m.depthWrite = opacity > 0.35;
        }
    });
}

export function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

export function cloneNormalizedColladaScene(scene: THREE.Object3D, targetSize: number) {
    const root = scene.clone(true);
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
    });
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(targetSize / maxDim);
    return root;
}

export function degToRad(deg: number) {
    return (deg * Math.PI) / 180;
}

/** Multiplier for beam visibility from shutter / strobe state (0 = off, 1 = full on). */
export function previewBeamGate(
    shutter: PreviewBeamShutter | undefined,
    strobeSpeed01: number,
    timeSec: number,
): number {
    switch (shutter ?? "open") {
        case "closed":
            return 0;
        case "pulse": {
            const hz = 0.35 + clamp01(strobeSpeed01) * 3.5;
            return 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(timeSec * hz * Math.PI * 2));
        }
        case "randomStrobe": {
            const hz = 0.6 + clamp01(strobeSpeed01) * 7;
            return Math.sin(timeSec * hz * 9.13 + Math.sin(timeSec * 2.7)) > 0.15 ? 1 : 0;
        }
        case "strobe": {
            const hz = 0.5 + clamp01(strobeSpeed01) * 14;
            const phase = (timeSec * hz) % 1;
            return phase < 0.45 ? 1 : 0;
        }
        default:
            return 1;
    }
}

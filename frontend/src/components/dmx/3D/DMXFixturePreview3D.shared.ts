import * as THREE from "three";

export type DMXFixturePreviewVariant = "movingHead" | "smoke";

export type DMXFixturePreview3DProps = {
    variant: DMXFixturePreviewVariant;
    panDeg: number;
    tiltDeg: number;
    maxPanDeg?: number;
    maxTiltDeg?: number;
    focus01?: number;
    beamColor?: string;
    beamRainbow?: boolean;
    intensity: number;
    disabled?: boolean;
    onPanTiltChange?: (value: { pan01: number; tilt01: number }) => void;
    /** When true, grow with the parent (e.g. live layout grid tile) instead of a fixed preview height. */
    fillGridCell?: boolean;
};

export type DMXMovingHeadPreview3DProps = Pick<
    DMXFixturePreview3DProps,
    "panDeg" | "tiltDeg" | "maxPanDeg" | "maxTiltDeg" | "focus01" | "beamColor" | "beamRainbow" | "intensity"
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

import {useFrame, useLoader} from "@react-three/fiber";
import {useMemo, useRef} from "react";
import {ColladaLoader} from "three/examples/jsm/loaders/ColladaLoader.js";
import * as THREE from "three";
import {
    clamp01,
    cloneNormalizedColladaScene,
    previewBeamGate,
    type DMXParPreview3DProps,
} from "./DMXFixturePreview3D.shared";

type LoadedParRig = {
    root: THREE.Object3D;
    headNode: THREE.Object3D | null;
    beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> | null;
    beamLengthScale: number;
};

const DEFAULT_BEAM_COLOR = "#ffffff";
const BEAM_LENGTH = 8.0;
const BEAM_APERTURE_MIN = 0.14;
const BEAM_APERTURE_MAX = 0.85;
const PAR_TARGET_SIZE = 1.35;

function createBeamMesh(scale: number, headNode: THREE.Object3D) {
    const material = new THREE.MeshBasicMaterial({
        color: DEFAULT_BEAM_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const geometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
    geometry.translate(0, -0.5, 0);

    const beam = new THREE.Mesh(geometry, material);
    const box = new THREE.Box3().setFromObject(headNode);
    // Lens opening sits on the low-Y end of the head; cone default extends -Y from its apex.
    const lensY = box.min.y;
    beam.position.set(0, lensY / scale - 0.02 / scale, 0);
    const lengthScale = BEAM_LENGTH / scale;
    beam.scale.set(BEAM_APERTURE_MIN / scale, lengthScale, BEAM_APERTURE_MIN / scale);
    beam.visible = false;
    return {beam, lengthScale};
}

export function DMXParPreview3D({
    focus01 = 0.5,
    beamColor,
    beamRainbow = false,
    beamShutter = "open",
    strobeSpeed01 = 0.5,
    intensity,
}: DMXParPreview3DProps) {
    const collada = useLoader(ColladaLoader, "/meshes/par.dae");
    const drive = useRef({
        focus01,
        beamColor,
        beamRainbow,
        beamShutter,
        strobeSpeed01,
        intensity,
    });
    drive.current = {
        focus01,
        beamColor,
        beamRainbow,
        beamShutter,
        strobeSpeed01,
        intensity,
    };

    const rig = useMemo<LoadedParRig>(() => {
        if (!collada) {
            return {
                root: new THREE.Group(),
                headNode: null,
                beam: null,
                beamLengthScale: 1,
            };
        }
        const root = cloneNormalizedColladaScene(collada.scene, PAR_TARGET_SIZE);
        const headNode = root.getObjectByName("head") ?? null;
        if (!headNode) {
            return {
                root,
                headNode: null,
                beam: null,
                beamLengthScale: 1,
            };
        }
        const {beam, lengthScale} = createBeamMesh(root.scale.x || 1, headNode);
        headNode.add(beam);

        return {
            root,
            headNode,
            beam,
            beamLengthScale: lengthScale,
        };
    }, [collada]);

    useFrame((state) => {
        if (!rig.beam) {
            return;
        }
        const {
            focus01: focus,
            beamColor: color,
            beamRainbow: rainbow,
            beamShutter: shutter,
            strobeSpeed01: speed01,
            intensity: dimmer01,
        } = drive.current;

        const gate = previewBeamGate(shutter, speed01, state.clock.elapsedTime);
        const output01 = clamp01(dimmer01) * gate;
        const focusClamped = clamp01(focus);
        const aperture = BEAM_APERTURE_MIN + focusClamped * (BEAM_APERTURE_MAX - BEAM_APERTURE_MIN);
        const scale = rig.root.scale.x || 1;

        rig.beam.scale.x = aperture / scale;
        rig.beam.scale.z = aperture / scale;
        rig.beam.scale.y = rig.beamLengthScale;
        rig.beam.visible = output01 > 0.03;
        rig.beam.material.opacity = 0.22 + output01 * 0.62;

        if (rainbow) {
            rig.beam.material.color.setHSL((state.clock.elapsedTime * 0.18) % 1, 1, 0.62);
        } else {
            rig.beam.material.color.set(color || DEFAULT_BEAM_COLOR);
        }
    });

    return <primitive object={rig.root}/>;
}

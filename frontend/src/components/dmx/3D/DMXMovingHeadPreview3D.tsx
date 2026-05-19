import {useFrame, useLoader} from "@react-three/fiber";
import {useLayoutEffect, useMemo, useRef} from "react";
import {ColladaLoader} from "three/examples/jsm/loaders/ColladaLoader.js";
import * as THREE from "three";
import type {Group} from "three";
import {
    clamp01,
    cloneNormalizedColladaScene,
    degToRad,
    type DMXMovingHeadPreview3DProps,
} from "./DMXFixturePreview3D.shared";

type LoadedMovingHeadRig = {
    root: THREE.Object3D;
    panNode: THREE.Object3D | null;
    tiltNode: THREE.Object3D | null;
    panRest: THREE.Euler | null;
    tiltRest: THREE.Euler | null;
    beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> | null;
};

const DEFAULT_BEAM_COLOR = "#ffe8a0";
const BEAM_LENGTH = 10.0;
const BEAM_APERTURE_MIN = 0.055;
const BEAM_APERTURE_MAX = 1.0;
const BEAM_LOCAL_LENS_Y = -0.34;
const MOVING_HEAD_TARGET_SIZE = 1.55;
const CEILING_LEVEL_TILT_OFFSET_DEG = -90;

function createBeamMesh(scale: number) {
    const material = new THREE.MeshBasicMaterial({
        color: DEFAULT_BEAM_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const geometry = new THREE.ConeGeometry(1, 1, 20, 1, true);
    geometry.translate(0, -0.5, 0);

    const beam = new THREE.Mesh(geometry, material);
    // In this DAE the lens is on the head's lower local-Y end.
    beam.position.set(0, BEAM_LOCAL_LENS_Y / scale, 0);
    beam.scale.set(BEAM_APERTURE_MIN / scale, BEAM_LENGTH / scale, BEAM_APERTURE_MIN / scale);
    beam.visible = false;
    return beam;
}

export function DMXMovingHeadPreview3D({
    panDeg,
    tiltDeg,
    maxPanDeg = 0,
    maxTiltDeg = 0,
    focus01 = 0.5,
    beamColor,
    beamRainbow = false,
    intensity,
}: DMXMovingHeadPreview3DProps) {
    const collada = useLoader(ColladaLoader, "/meshes/moving_head.dae");
    const fallbackPivot = useRef<Group>(null);
    const fallbackHead = useRef<Group>(null);
    const angles = useRef({panDeg, tiltDeg, maxPanDeg, maxTiltDeg});
    angles.current = {panDeg, tiltDeg, maxPanDeg, maxTiltDeg};

    const rig = useMemo<LoadedMovingHeadRig>(() => {
        if (!collada) {
            return {
                root: new THREE.Group(),
                panNode: null,
                tiltNode: null,
                panRest: null,
                tiltRest: null,
                beam: null,
            };
        }
        const root = cloneNormalizedColladaScene(collada.scene, MOVING_HEAD_TARGET_SIZE);
        const panNode = root.getObjectByName("arm") ?? null;
        const tiltNode = root.getObjectByName("head") ?? null;
        const beam = tiltNode ? createBeamMesh(root.scale.x || 1) : null;
        if (beam && tiltNode) {
            tiltNode.add(beam);
        }

        return {
            root,
            panNode,
            tiltNode,
            panRest: panNode?.rotation.clone() ?? null,
            tiltRest: tiltNode?.rotation.clone() ?? null,
            beam,
        };
    }, [collada]);

    useLayoutEffect(() => {
        if (!rig.beam) {
            return;
        }
        const focus = clamp01(focus01);
        const aperture = BEAM_APERTURE_MIN + focus * (BEAM_APERTURE_MAX - BEAM_APERTURE_MIN);
        const beamOpacity = 0.2 + clamp01(intensity) * 0.55;
        rig.beam.scale.x = aperture / rig.root.scale.x;
        rig.beam.scale.z = aperture / rig.root.scale.z;
        rig.beam.visible = intensity > 0.03;
        rig.beam.material.opacity = beamOpacity;
        if (!beamRainbow) {
            rig.beam.material.color.set(beamColor || DEFAULT_BEAM_COLOR);
        }
    }, [rig.beam, rig.root.scale.x, rig.root.scale.z, intensity, focus01, beamColor, beamRainbow]);

    useFrame((state) => {
        if (!fallbackPivot.current || !fallbackHead.current) {
            return;
        }
        const {panDeg: p, tiltDeg: t, maxPanDeg: maxPan, maxTiltDeg: maxTilt} = angles.current;
        if (rig.beam && beamRainbow) {
            rig.beam.material.color.setHSL((state.clock.elapsedTime * 0.18) % 1, 1, 0.62);
        }

        const visualPanDeg = p - maxPan / 2;
        const visualTiltDeg = t - maxTilt / 2 + CEILING_LEVEL_TILT_OFFSET_DEG;

        if (rig.panNode && rig.tiltNode && rig.panRest && rig.tiltRest) {
            fallbackPivot.current.rotation.set(0, 0, 0);
            fallbackHead.current.rotation.set(0, 0, 0);
            rig.panNode.rotation.set(rig.panRest.x, rig.panRest.y + degToRad(visualPanDeg), rig.panRest.z);
            rig.tiltNode.rotation.set(rig.tiltRest.x + degToRad(visualTiltDeg), rig.tiltRest.y, rig.tiltRest.z);
            return;
        }

        fallbackPivot.current.rotation.set(0, degToRad(visualPanDeg), 0);
        fallbackHead.current.rotation.set(degToRad(visualTiltDeg), 0, 0);
    });

    return (
        <group ref={fallbackPivot}>
            <group ref={fallbackHead}>
                <primitive object={rig.root}/>
            </group>
        </group>
    );
}

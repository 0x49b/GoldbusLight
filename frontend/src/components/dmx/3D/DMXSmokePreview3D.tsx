import {createPortal, useFrame, useLoader} from "@react-three/fiber";
import {useLayoutEffect, useMemo, useRef} from "react";
import {ColladaLoader} from "three/examples/jsm/loaders/ColladaLoader.js";
import * as THREE from "three";
import type {Group, Points} from "three";
import {
    applyOpacity,
    clamp01,
    cloneNormalizedColladaScene,
    type DMXSmokePreview3DProps,
} from "./DMXFixturePreview3D.shared";

type LoadedSmokeRig = {
    root: THREE.Object3D;
    smokeNode: THREE.Object3D | null;
};

const SMOKE_TARGET_SIZE = 1.35;
const SMOKE_PARTICLE_COUNT = 80;
const SMOKE_PLUME_LENGTH_MIN = 0.45;
const SMOKE_PLUME_LENGTH_MAX = 3.2;

function makeSmokeParticleGeometry() {
    const positions = new Float32Array(SMOKE_PARTICLE_COUNT * 3);
    const phases = new Float32Array(SMOKE_PARTICLE_COUNT);
    for (let i = 0; i < SMOKE_PARTICLE_COUNT; i++) {
        phases[i] = i / SMOKE_PARTICLE_COUNT;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return {geometry, phases};
}

function makeSmokeParticleMaterial() {
    return new THREE.PointsMaterial({
        color: "#d8d8d8",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        size: 0.085,
        sizeAttenuation: true,
    });
}

function SmokePlume({parent, intensity, scale}: { parent: THREE.Object3D | null; intensity: number; scale: number }) {
    const pointsRef = useRef<Points<THREE.BufferGeometry, THREE.PointsMaterial> | null>(null);
    const particleData = useMemo(() => makeSmokeParticleGeometry(), []);
    const material = useMemo(() => makeSmokeParticleMaterial(), []);
    const output = clamp01(intensity);

    useFrame((state) => {
        const points = pointsRef.current;
        if (!points) {
            return;
        }
        points.visible = output > 0.01;
        material.opacity = output * 0.55;
        if (output <= 0.01) {
            return;
        }

        const positions = particleData.geometry.attributes.position as THREE.BufferAttribute;
        const time = state.clock.elapsedTime * (0.12 + output * 0.55);
        const radiusBase = 0.025 / scale;
        const radiusSpread = (0.18 + output * 0.28) / scale;
        const plumeLength = (SMOKE_PLUME_LENGTH_MIN + output * (SMOKE_PLUME_LENGTH_MAX - SMOKE_PLUME_LENGTH_MIN)) / scale;

        for (let i = 0; i < SMOKE_PARTICLE_COUNT; i++) {
            const life = (particleData.phases[i] + time) % 1;
            const angle = i * 2.399963 + time * 3;
            const radius = radiusBase + radiusSpread * life;
            const wobble = Math.sin(time * 7 + i) * 0.025 / scale;
            positions.setXYZ(
                i,
                Math.cos(angle) * radius + wobble,
                Math.sin(angle * 0.73) * radius * 0.45 + (0.03 + output * 0.04) / scale,
                life * plumeLength,
            );
        }
        positions.needsUpdate = true;
    });

    return parent ? createPortal(<points ref={pointsRef} args={[particleData.geometry, material]}/>, parent) : null;
}

export function DMXSmokePreview3D({panDeg, tiltDeg, intensity}: DMXSmokePreview3DProps) {
    const collada = useLoader(ColladaLoader, "/meshes/smoke.dae");
    const fallbackPivot = useRef<Group>(null);
    const fallbackHead = useRef<Group>(null);
    const angles = useRef({panDeg, tiltDeg});
    angles.current = {panDeg, tiltDeg};

    const rig = useMemo<LoadedSmokeRig>(() => {
        if (!collada) {
            return {
                root: new THREE.Group(),
                smokeNode: null,
            };
        }
        const root = cloneNormalizedColladaScene(collada.scene, SMOKE_TARGET_SIZE);
        return {
            root,
            smokeNode: root.getObjectByName("emitter") ?? null,
        };
    }, [collada]);

    useLayoutEffect(() => {
        applyOpacity(rig.root, 1);
    }, [rig.root]);

    useFrame(() => {
        if (!fallbackPivot.current || !fallbackHead.current) {
            return;
        }
        fallbackPivot.current.rotation.set(0, 0,0);//degToRad(angles.current.panDeg), 0);
        fallbackHead.current.rotation.set(0,0,0);//degToRad(angles.current.tiltDeg), 0, 0);
    });

    return (
        <group ref={fallbackPivot}>
            <group ref={fallbackHead}>
                <primitive object={rig.root}/>
                <SmokePlume parent={rig.smokeNode} intensity={intensity} scale={rig.root.scale.x || 1}/>
            </group>
        </group>
    );
}

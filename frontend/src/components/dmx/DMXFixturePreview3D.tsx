import {Canvas, useFrame, useLoader} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {Suspense, useLayoutEffect, useMemo, useRef} from "react";
import {ColladaLoader} from "three/examples/jsm/loaders/ColladaLoader.js";
import * as THREE from "three";
import type {Group} from "three";

export type DMXFixturePreview3DProps = {
    variant: "movingHead" | "smoke";
    panDeg: number;
    tiltDeg: number;
    maxPanDeg?: number;
    maxTiltDeg?: number;
    focus01?: number;
    beamColor?: string;
    intensity: number;
};

type LoadedRig = {
    root: THREE.Object3D;
    panNode: THREE.Object3D | null;
    tiltNode: THREE.Object3D | null;
    panRest: THREE.Euler | null;
    tiltRest: THREE.Euler | null;
    beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> | null;
};

const DEFAULT_BEAM_COLOR = "#ffe8a0";
const BEAM_LENGTH = 0.82;
const BEAM_APERTURE_MIN = 0.055;
const BEAM_APERTURE_MAX = 0.22;
const BEAM_LOCAL_LENS_Y = -0.34;

function applyOpacity(root: THREE.Object3D, opacity: number) {
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

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

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

function degToRad(deg: number) {
    return (deg * Math.PI) / 180;
}

function LoadedFixture({
    variant,
    panDeg,
    tiltDeg,
    maxPanDeg = 0,
    maxTiltDeg = 0,
    focus01 = 0.5,
    beamColor,
    intensity,
}: DMXFixturePreview3DProps) {
    const url = variant === "smoke" ? "/meshes/smoke.dae" : "/meshes/moving_head.dae";
    const collada = useLoader(ColladaLoader, url);
    const fallbackPivot = useRef<Group>(null);
    const fallbackHead = useRef<Group>(null);
    const angles = useRef({panDeg, tiltDeg, maxPanDeg, maxTiltDeg});
    angles.current = {panDeg, tiltDeg, maxPanDeg, maxTiltDeg};

    const rig = useMemo<LoadedRig>(() => {
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
        const root = collada.scene.clone(true);
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
        const target = variant === "smoke" ? 1.35 : 1.55;
        const scale = target / maxDim;
        root.scale.setScalar(scale);

        const panNode = variant === "movingHead" ? root.getObjectByName("arm") ?? null : null;
        const tiltNode = variant === "movingHead" ? root.getObjectByName("head") ?? null : null;
        const beam = tiltNode ? createBeamMesh(scale) : null;
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
    }, [collada, variant]);

    useLayoutEffect(() => {
        if (variant === "smoke") {
            applyOpacity(rig.root, 0.15 + Math.max(0, Math.min(1, intensity)) * 0.85);
        }
    }, [rig.root, variant, intensity]);

    useLayoutEffect(() => {
        if (!rig.beam) {
            return;
        }
        const focus = clamp01(focus01);
        const aperture = BEAM_APERTURE_MIN + focus * (BEAM_APERTURE_MAX - BEAM_APERTURE_MIN);
        const beamOpacity = 0.2 + Math.max(0, Math.min(1, intensity)) * 0.55;
        rig.beam.scale.x = aperture / rig.root.scale.x;
        rig.beam.scale.z = aperture / rig.root.scale.z;
        rig.beam.visible = intensity > 0.03;
        rig.beam.material.opacity = beamOpacity;
        rig.beam.material.color.set(beamColor || DEFAULT_BEAM_COLOR);
    }, [rig.beam, rig.root.scale.x, rig.root.scale.y, intensity, focus01, beamColor]);

    useFrame(() => {
        if (!fallbackPivot.current || !fallbackHead.current) {
            return;
        }
        const {panDeg: p, tiltDeg: t, maxPanDeg: maxPan, maxTiltDeg: maxTilt} = angles.current;

        if (variant === "movingHead" && rig.panNode && rig.tiltNode && rig.panRest && rig.tiltRest) {
            fallbackPivot.current.rotation.set(0, 0, 0);
            fallbackHead.current.rotation.set(0, 0, 0);
            rig.panNode.rotation.set(rig.panRest.x, rig.panRest.y + degToRad(p - maxPan / 2), rig.panRest.z);
            rig.tiltNode.rotation.set(rig.tiltRest.x + degToRad(t - maxTilt / 2), rig.tiltRest.y, rig.tiltRest.z);
            return;
        }

        fallbackPivot.current.rotation.set(0, degToRad(p), 0);
        fallbackHead.current.rotation.set(degToRad(t), 0, 0);
    });

    return (
        <group ref={fallbackPivot}>
            <group ref={fallbackHead}>
                <primitive object={rig.root}/>
            </group>
        </group>
    );
}

export function DMXFixturePreview3D(props: DMXFixturePreview3DProps) {
    return (
        <div className="h-56 w-full overflow-hidden rounded-md border border-border bg-zinc-950">
            <Canvas shadows dpr={[1, 2]} camera={{position: [2.35, 1.45, 2.55], fov: 42}}>
                <color attach="background" args={["#070707"]}/>
                <ambientLight intensity={0.45}/>
                <directionalLight castShadow position={[3.5, 6, 4]} intensity={1.15}/>
                <Suspense fallback={null}>
                    <LoadedFixture {...props} />
                </Suspense>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]} receiveShadow>
                    <planeGeometry args={[8, 8]}/>
                    <shadowMaterial opacity={0.35}/>
                </mesh>
                <gridHelper args={[5, 20, "#2a2a2a", "#1a1a1a"]} position={[0, -0.71, 0]}/>
                <OrbitControls enablePan={false} minPolarAngle={0.35} maxPolarAngle={Math.PI / 2 - 0.08} minDistance={1.4} maxDistance={7}/>
            </Canvas>
        </div>
    );
}

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
    intensity: number;
};

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

function LoadedFixture({variant, panDeg, tiltDeg, intensity}: DMXFixturePreview3DProps) {
    const url = variant === "smoke" ? "/meshes/smoke.dae" : "/meshes/moving_head.dae";
    const collada = useLoader(ColladaLoader, url);
    const pivot = useRef<Group>(null);
    const head = useRef<Group>(null);
    const angles = useRef({panDeg, tiltDeg});
    angles.current = {panDeg, tiltDeg};

    const rootObj = useMemo(() => {
        if (!collada) {
            return new THREE.Group();
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
        root.scale.setScalar(target / maxDim);
        return root;
    }, [collada, variant]);

    useLayoutEffect(() => {
        if (variant === "smoke") {
            applyOpacity(rootObj, 0.15 + Math.max(0, Math.min(1, intensity)) * 0.85);
        }
    }, [rootObj, variant, intensity]);

    useFrame(() => {
        if (!pivot.current || !head.current) {
            return;
        }
        const {panDeg: p, tiltDeg: t} = angles.current;
        pivot.current.rotation.set(0, (p * Math.PI) / 180, 0);
        head.current.rotation.set((t * Math.PI) / 180, 0, 0);
    });

    const beamOpacity = 0.2 + Math.max(0, Math.min(1, intensity)) * 0.55;

    return (
        <group ref={pivot}>
            <group ref={head}>
                <primitive object={rootObj}/>
                {variant === "movingHead" && (
                    <mesh position={[0, 0.05, 0.55]} rotation={[Math.PI / 2, 0, 0]} visible={intensity > 0.03}>
                        <coneGeometry args={[0.12, 0.55, 20, 1, true]}/>
                        <meshBasicMaterial
                            color="#ffe8a0"
                            transparent
                            opacity={beamOpacity}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                )}
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

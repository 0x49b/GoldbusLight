import {Canvas} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {type PointerEvent, Suspense, useCallback, useRef} from "react";
import {DMXMovingHeadPreview3D} from "./3D/DMXMovingHeadPreview3D";
import {DMXParPreview3D} from "./3D/DMXParPreview3D";
import {DMXSmokePreview3D} from "./3D/DMXSmokePreview3D";
import {clamp01, type DMXFixturePreview3DProps} from "./3D/DMXFixturePreview3D.shared";
import {cn} from "@/lib/utils";
export type {DMXFixturePreview3DProps} from "./3D/DMXFixturePreview3D.shared";

type PreviewDragState = {
    pointerId: number;
    startX: number;
    startY: number;
    startPan01: number;
    startTilt01: number;
    width: number;
    height: number;
};

/** Moving head hangs from a ceiling truss near the top of the view. */
const MOVING_HEAD_LIFT_Y = 1.9;
/** Truss bar height in the lifted fixture's local space (just above the fixture body). */
const CEILING_LOCAL_Y = 0.82;
/** Orbit/camera focus, biased below the fixture so the down-pointing beam stays in frame. */
const MOVING_HEAD_FOCUS_Y = 0.45;

/** A fixed ceiling truss bar with a mounting clamp the fixture hangs from. */
function CeilingMount() {
    return (
        <group position={[0, CEILING_LOCAL_Y, 0]}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[3.2, 0.12, 0.55]}/>
                <meshStandardMaterial color="#2b2b2e" metalness={0.55} roughness={0.5}/>
            </mesh>
            <mesh position={[0, -0.13, 0]} castShadow>
                <boxGeometry args={[0.2, 0.16, 0.2]}/>
                <meshStandardMaterial color="#3a3a3f" metalness={0.5} roughness={0.6}/>
            </mesh>
        </group>
    );
}


function PreviewFixture(props: DMXFixturePreview3DProps) {
    if (props.variant === "smoke") {
        return (
            <DMXSmokePreview3D
                panDeg={props.panDeg}
                tiltDeg={props.tiltDeg}
                intensity={props.intensity}
            />
        );
    }

    if (props.variant === "par") {
        return (
            <DMXParPreview3D
                focus01={props.focus01}
                beamColor={props.beamColor}
                beamRainbow={props.beamRainbow}
                beamShutter={props.beamShutter}
                strobeSpeed01={props.strobeSpeed01}
                intensity={props.intensity}
            />
        );
    }

    return (
        <DMXMovingHeadPreview3D
            panDeg={props.panDeg}
            tiltDeg={props.tiltDeg}
            maxPanDeg={props.maxPanDeg}
            maxTiltDeg={props.maxTiltDeg}
            focus01={props.focus01}
            beamColor={props.beamColor}
            beamRainbow={props.beamRainbow}
            beamShutter={props.beamShutter}
            strobeSpeed01={props.strobeSpeed01}
            intensity={props.intensity}
        />
    );
}

export function DMXFixturePreview3D(props: DMXFixturePreview3DProps) {
    const dragRef = useRef<PreviewDragState | null>(null);
    const interactive = props.variant === "movingHead" && !props.disabled && Boolean(props.onPanTiltChange);
    const pan01 = props.maxPanDeg && props.maxPanDeg > 0 ? clamp01(props.panDeg / props.maxPanDeg) : 0.5;
    const tilt01 = props.maxTiltDeg && props.maxTiltDeg > 0 ? clamp01(props.tiltDeg / props.maxTiltDeg) : 0.5;
    const fill = Boolean(props.fillGridCell);

    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!interactive || event.button !== 0) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startPan01: pan01,
            startTilt01: tilt01,
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }, [interactive, pan01, tilt01]);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        const nextPan01 = clamp01(drag.startPan01 + (event.clientX - drag.startX) / drag.width);
        const nextTilt01 = clamp01(drag.startTilt01 - (event.clientY - drag.startY) / drag.height);
        props.onPanTiltChange?.({pan01: nextPan01, tilt01: nextTilt01});
        event.preventDefault();
    }, [props.onPanTiltChange]);

    const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) {
            return;
        }
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    return (
        <div
            className={cn(
                "w-full overflow-hidden rounded-md border border-border bg-zinc-950",
                fill ? "flex min-h-56 flex-1 flex-col" : "h-56",
                interactive && "cursor-grab active:cursor-grabbing",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
        >
            <div className={cn(fill ? "min-h-0 flex-1" : "h-full w-full")}>
                <Canvas
                    className={fill ? "h-full w-full" : undefined}
                    shadows
                    dpr={[1, 2]}
                    camera={{position: [2.35, 1.45, 2.55], fov: 75, near: 0.5, far: 1000}}
                >
                    <color attach="background" args={["#070707"]}/>
                    <ambientLight intensity={0.6}/>
                    <directionalLight castShadow position={[3.5, 6, 4]} intensity={1.15}/>
                    <Suspense fallback={null}>
                        {props.variant === "movingHead" ? (
                            <group position={[0, MOVING_HEAD_LIFT_Y, 0]}>
                                <PreviewFixture {...props} />
                                <CeilingMount/>
                            </group>
                        ) : (
                            <PreviewFixture {...props} />
                        )}
                    </Suspense>
                    <OrbitControls
                        enablePan={false}
                        enableZoom={false}
                        enableRotate={props.variant !== "movingHead"}
                        target={props.variant === "movingHead" ? [0, MOVING_HEAD_FOCUS_Y, 0] : [0, 0, 0]}
                    />
                </Canvas>
            </div>
        </div>
    );
}

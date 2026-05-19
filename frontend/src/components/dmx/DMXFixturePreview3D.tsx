import {Canvas} from "@react-three/fiber";
import {OrbitControls} from "@react-three/drei";
import {type PointerEvent, Suspense, useCallback, useRef} from "react";
import {DMXMovingHeadPreview3D} from "./DMXMovingHeadPreview3D";
import {DMXSmokePreview3D} from "./DMXSmokePreview3D";
import {clamp01, type DMXFixturePreview3DProps} from "./DMXFixturePreview3D.shared";
export type {DMXFixturePreview3DProps} from "./DMXFixturePreview3D.shared";

type PreviewDragState = {
    pointerId: number;
    startX: number;
    startY: number;
    startPan01: number;
    startTilt01: number;
    width: number;
    height: number;
};


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

    return (
        <DMXMovingHeadPreview3D
            panDeg={props.panDeg}
            tiltDeg={props.tiltDeg}
            maxPanDeg={props.maxPanDeg}
            maxTiltDeg={props.maxTiltDeg}
            focus01={props.focus01}
            beamColor={props.beamColor}
            beamRainbow={props.beamRainbow}
            intensity={props.intensity}
        />
    );
}

export function DMXFixturePreview3D(props: DMXFixturePreview3DProps) {
    const dragRef = useRef<PreviewDragState | null>(null);
    const interactive = props.variant === "movingHead" && !props.disabled && Boolean(props.onPanTiltChange);
    const pan01 = props.maxPanDeg && props.maxPanDeg > 0 ? clamp01(props.panDeg / props.maxPanDeg) : 0.5;
    const tilt01 = props.maxTiltDeg && props.maxTiltDeg > 0 ? clamp01(props.tiltDeg / props.maxTiltDeg) : 0.5;

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
            className={`h-56 w-full overflow-hidden rounded-md border border-border bg-zinc-950 ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
        >
            <Canvas shadows dpr={[1, 2]} camera={{position: [2.35, 1.45, 2.55], fov: 75, near: 0.5, far: 1000}}>
                <color attach="background" args={["#070707"]}/>
                <ambientLight intensity={0.6}/>
                <directionalLight castShadow position={[3.5, 6, 4]} intensity={1.15}/>
                <Suspense fallback={null}>
                    <PreviewFixture {...props} />
                </Suspense>
                <OrbitControls enablePan={false} enableRotate={props.variant !== "movingHead"} minDistance={1.4} maxDistance={7}/>
            </Canvas>
        </div>
    );
}

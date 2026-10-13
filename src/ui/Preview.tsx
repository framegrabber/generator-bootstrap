import type { ComponentRef, RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import type { Mesh, Part } from "../core/types";
import { useView } from "../state/view-store";
import { boundsOf, fitView, type FitView } from "./fit";
import { meshToGeometry } from "./geometry";

type Props = { parts: readonly Part[] | null; busy: boolean };

export function Preview({ parts, busy }: Props) {
  const view = useMemo<FitView | null>(() => {
    const bounds = parts ? boundsOf(parts) : null;
    return bounds ? fitView(bounds) : null;
  }, [parts]);
  const fitToken = useView((s) => s.fitToken);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);

  return (
    <div className="preview">
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [120, 100, 120], fov: 35, near: 0.1, far: 5000 }}
      >
        <color attach="background" args={["#1b1d22"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 80, 60]} intensity={1.2} />
        {/* Geometry is Z-up; display Y-up so the gizmo's axes match. See fit.ts. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {parts?.map((part) => (
            <PartMesh key={part.name} mesh={part.mesh} />
          ))}
        </group>
        <Grid
          infiniteGrid
          cellSize={5}
          sectionSize={10}
          fadeDistance={400}
          cellColor="#3a3f48"
          sectionColor="#5a6170"
        />
        <OrbitControls ref={controlsRef} makeDefault />
        <FitCamera view={view} token={fitToken} controlsRef={controlsRef} />
        <GizmoHelper alignment="top-left" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>
      </Canvas>
      {busy && <div className="preview-status">Building...</div>}
      {!parts && !busy && <div className="preview-status">No geometry yet</div>}
    </div>
  );
}

/**
 * Frames the model on first availability and on explicit fit requests only. Re-framing on every
 * rebuild would fight the user's camera while they tweak parameters.
 */
function FitCamera({
  view,
  token,
  controlsRef,
}: {
  view: FitView | null;
  token: number;
  controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>;
}) {
  const camera = useThree((s) => s.camera);
  const lastToken = useRef<number | null>(null);

  useEffect(() => {
    if (!view || lastToken.current === token) return;
    lastToken.current = token;
    camera.position.set(...view.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...view.target);
      controls.update();
    } else {
      camera.lookAt(...view.target);
    }
  }, [view, token, camera, controlsRef]);

  return null;
}

function PartMesh({ mesh }: { mesh: Mesh }) {
  const geometry = useMemo(() => meshToGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#d9c7a7" roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

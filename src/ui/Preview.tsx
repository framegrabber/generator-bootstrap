import type { ComponentRef } from "react";
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, GizmoHelper, GizmoViewcube, Grid, Line } from "@react-three/drei";
import { Box3, Sphere, Vector3 } from "three";
import { PRINT_BED } from "../app-config";
import { boundsOf, type Bounds, type Vec3 } from "../core/bounds";
import type { Mesh } from "../core/types";
import { useBuild } from "../state/build-store";
import { useView } from "../state/view-store";
import { displayBounds, toDisplay, VIEW_PRESETS, type ViewPreset } from "./fit";
import { meshToGeometry } from "./geometry";

type Controls = ComponentRef<typeof CameraControls>;

/** Preview colours for parts that do not set `color`. */
const PART_PALETTE = ["#d9c7a7", "#8fb8de", "#c4a2d9", "#9fd6a9", "#e8a38f", "#e6d38a"];

/** Frames `bounds` (geometry space); with a preset, also swings the camera to that angle. */
function frame(controls: Controls, bounds: Bounds, preset: ViewPreset | null, animate: boolean) {
  const { min, max } = displayBounds(bounds);
  const sphere = new Box3(new Vector3(...min), new Vector3(...max)).getBoundingSphere(new Sphere());
  if (preset) {
    const { azimuth, polar } = VIEW_PRESETS[preset];
    void controls.rotateTo(azimuth, polar, animate);
  }
  void controls.fitToSphere(sphere, animate);
}

export function Preview() {
  const result = useBuild((s) => s.result);
  const busy = useBuild((s) => s.busy);
  // The shown result belongs to the current params; only then may a pending fit use it.
  const resultIsCurrent = useBuild((s) => s.result !== null && s.resultKey === s.currentKey);
  const fitPending = useView((s) => s.fitPending);
  // State, not a ref: the controls mount inside the Canvas after this component's first effects,
  // and the fit effect must re-run once they exist.
  const [controls, setControls] = useState<Controls | null>(null);

  const parts = result?.parts ?? null;
  const bounds = useMemo(() => (parts ? boundsOf(parts.map((p) => p.mesh)) : null), [parts]);

  // Frames the first geometry and the first result after a generator switch or settings load,
  // never ordinary rebuilds: re-framing while the user tweaks values would fight their camera.
  useEffect(() => {
    if (!fitPending || !resultIsCurrent || !bounds || !controls) return;
    frame(controls, bounds, "iso", false);
    useView.getState().clearFitPending();
  }, [fitPending, resultIsCurrent, bounds, controls]);

  const act = (preset: ViewPreset | null) => {
    if (controls && bounds) frame(controls, bounds, preset, true);
  };

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
          {parts?.map((part, index) => (
            <PartMesh
              key={part.name}
              mesh={part.mesh}
              color={part.color ?? PART_PALETTE[index % PART_PALETTE.length]}
            />
          ))}
        </group>
        {bounds && <Bed bounds={bounds} />}
        <CameraControls ref={setControls} makeDefault />
        <GizmoHelper alignment="top-left" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>
      </Canvas>
      <div className="view-toolbar">
        <button type="button" disabled={!bounds} onClick={() => act(null)}>
          Fit
        </button>
        {Object.entries(VIEW_PRESETS).map(([preset, { label }]) => (
          <button
            key={preset}
            type="button"
            disabled={!bounds}
            onClick={() => act(preset as ViewPreset)}
          >
            {label}
          </button>
        ))}
      </div>
      {busy && <div className="preview-status">Building...</div>}
      {!parts && !busy && <div className="preview-status">No geometry yet</div>}
    </div>
  );
}

/** Build plate outline and grid, centred under the model the way a slicer places it. */
function Bed({ bounds }: { bounds: Bounds }) {
  const { width, depth } = PRINT_BED;
  const center = toDisplay([
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    0,
  ]);
  const [hw, hd] = [width / 2, depth / 2];
  const outline: Vec3[] = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
    [-hw, 0, -hd],
  ];
  return (
    <group position={center}>
      <Grid
        args={[width, depth]}
        cellSize={10}
        sectionSize={50}
        cellColor="#3a3f48"
        sectionColor="#5a6170"
        fadeDistance={2000}
      />
      <Line points={outline} color="#6aa8ff" lineWidth={1.5} />
    </group>
  );
}

function PartMesh({ mesh, color }: { mesh: Mesh; color: string }) {
  const geometry = useMemo(() => meshToGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}


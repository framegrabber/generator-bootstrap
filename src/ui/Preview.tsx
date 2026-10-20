import type { ComponentRef } from "react";
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, GizmoHelper, GizmoViewcube, Grid, Line } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Box3, DoubleSide, Matrix4, Sphere, Vector3 } from "three";
import { PRINT_BED } from "../app-config";
import { boundsOf, type Bounds, type Vec3 } from "../core/bounds";
import { transformBounds, type Mat4 } from "../core/mat4";
import type { CutPlane, Mesh, Part } from "../core/types";
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
  const cutPlanes = result?.cutPlanes ?? [];
  const standIns = result?.standIns ?? [];
  const hasAssembled = parts?.some((p) => p.assembled) ?? false;
  const chosenLayout = useView((s) => s.layout);
  const layout = hasAssembled ? chosenLayout : "print";
  const showCuts = useView((s) => s.showCuts) && layout === "assembled";
  // In the assembled view only parts with a placement show, moved into place.
  const shown = useMemo(
    () =>
      (parts ?? []).flatMap((part, index): Shown[] => {
        if (layout === "print") return [{ part, index, matrix: null }];
        return part.assembled ? [{ part, index, matrix: part.assembled }] : [];
      }),
    [parts, layout],
  );
  const bounds = useMemo(() => shownBounds(shown), [shown]);

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
          {shown.map(({ part, index, matrix }) => (
            <PartMesh
              key={part.name}
              mesh={part.mesh}
              matrix={matrix}
              color={part.color ?? PART_PALETTE[index % PART_PALETTE.length]}
            />
          ))}
          {layout === "assembled" &&
            standIns.map((s) => (
              <PartMesh key={`stand-in-${s.name}`} mesh={s.mesh} matrix={null} color={s.color} />
            ))}
          {showCuts && cutPlanes.map((plane) => <CutPlaneMesh key={plane.name} plane={plane} />)}
        </group>
        {bounds && <Bed bounds={bounds} />}
        <CameraControls ref={setControls} makeDefault />
        <GizmoHelper alignment="top-left" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>
      </Canvas>
      <div className="view-toolbar">
        {hasAssembled && (
          <>
            <button
              type="button"
              aria-pressed={layout === "assembled"}
              onClick={() => useView.getState().setLayout("assembled")}
            >
              Assembled
            </button>
            <button
              type="button"
              aria-pressed={layout === "print"}
              onClick={() => useView.getState().setLayout("print")}
            >
              Print layout
            </button>
          </>
        )}
        {layout === "assembled" && cutPlanes.length > 0 && (
          <button
            type="button"
            aria-pressed={showCuts}
            onClick={() => useView.getState().toggleCuts()}
          >
            Cut planes
          </button>
        )}
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

type Shown = { part: Part; index: number; matrix: Mat4 | null };

/** Bounds of the shown parts, each moved by its matrix. */
function shownBounds(shown: readonly Shown[]): Bounds | null {
  const boxes = shown.flatMap(({ part, matrix }) => {
    const own = boundsOf([part.mesh]);
    if (!own) return [];
    return [matrix ? transformBounds(matrix, own) : own];
  });
  if (boxes.length === 0) return null;
  const pick = (f: (...v: number[]) => number, corner: "min" | "max") =>
    [0, 1, 2].map((k) => f(...boxes.map((b) => b[corner][k]))) as Vec3;
  return { min: pick(Math.min, "min"), max: pick(Math.max, "max") };
}

function PartMesh({ mesh, color, matrix }: { mesh: Mesh; color: string; matrix: Mat4 | null }) {
  const geometry = useMemo(() => meshToGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const placement = useMemo(() => (matrix ? new Matrix4().fromArray(matrix) : null), [matrix]);
  const body = (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
  if (!placement) return body;
  return (
    <group matrix={placement} matrixAutoUpdate={false}>
      {body}
    </group>
  );
}

const CUT_COLOR = "#ff9f43";

/** A cut as a translucent rectangle through its four corners. */
function CutPlaneMesh({ plane }: { plane: CutPlane }) {
  const { corners } = plane;
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(corners.flat()), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [corners]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial
          color={CUT_COLOR}
          transparent
          opacity={0.25}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line points={[...corners, corners[0]]} color={CUT_COLOR} lineWidth={1.5} />
    </>
  );
}

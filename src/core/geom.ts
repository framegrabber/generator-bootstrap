import type { CrossSection, Manifold } from "manifold-3d";
import type { WasmScope } from "./manifold";
import type { ManifoldLib } from "./types";

/**
 * Shared building blocks for generators. Every helper tracks what it creates in `scope`, so the
 * caller's withScope deletes intermediates and results alike. All dimensions are millimetres.
 */
export type Geom = { wasm: ManifoldLib; scope: WasmScope };

/** Circle segment count for holes; dense enough that printed holes measure close to nominal. */
export const HOLE_SEGMENTS = 48;

/** Rounded rectangle spanning [0, width] x [0, height]. `radius` 0 gives sharp corners. */
export function roundedRect(
  { wasm, scope }: Geom,
  width: number,
  height: number,
  radius: number,
): CrossSection {
  if (radius <= 0) return scope.track(wasm.CrossSection.square([width, height]));
  // Offsetting a shrunken square by `radius` rounds every corner with exactly that radius.
  const inner = scope.track(wasm.CrossSection.square([width - 2 * radius, height - 2 * radius]));
  const placed = scope.track(inner.translate([radius, radius]));
  return scope.track(placed.offset(radius, "Round"));
}

export type HoleOptions = {
  /** Shaft diameter. */
  diameter: number;
  /** Material thickness the hole passes through, from z = 0 up. */
  depth: number;
  /** Hole axis position in XY. */
  at: readonly [number, number];
  segments?: number;
};

/** Cutting tool for a vertical through-hole; it overshoots 1 mm at both ends for clean booleans. */
export function throughHole(
  { wasm, scope }: Geom,
  { diameter, depth, at, segments = HOLE_SEGMENTS }: HoleOptions,
): Manifold {
  const shaft = scope.track(wasm.Manifold.cylinder(depth + 2, diameter / 2, -1, segments));
  return scope.track(shaft.translate([at[0], at[1], -1]));
}

/**
 * Cutting tool for a through-hole with a 90 degree countersink opening at z = depth, for
 * flat-head screws. `headDiameter` is the screw head's diameter.
 */
export function countersunkHole(
  geom: Geom,
  { headDiameter, ...hole }: HoleOptions & { headDiameter: number },
): Manifold {
  const { wasm, scope } = geom;
  const { diameter, depth, at, segments = HOLE_SEGMENTS } = hole;
  if (headDiameter <= diameter) throw new Error("Countersink head must be wider than the shaft");
  const sinkDepth = (headDiameter - diameter) / 2;
  if (sinkDepth > depth) throw new Error("Countersink is deeper than the material");

  const shaft = throughHole(geom, hole);
  const cone = scope.track(
    wasm.Manifold.cylinder(sinkDepth, diameter / 2, headDiameter / 2, segments),
  );
  // Continue the head radius above the surface so the top face is cut cleanly.
  const cap = scope.track(wasm.Manifold.cylinder(1, headDiameter / 2, -1, segments));
  const sink = scope.track(
    wasm.Manifold.union([
      scope.track(cone.translate([at[0], at[1], depth - sinkDepth])),
      scope.track(cap.translate([at[0], at[1], depth])),
    ]),
  );
  return scope.track(wasm.Manifold.union([shaft, sink]));
}

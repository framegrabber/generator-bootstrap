import { boundsOf } from "./bounds";
import type { GeneratorResult } from "./types";

/** Printer build volume in millimetres. */
export type PrintBed = { width: number; depth: number; height: number };

export type CheckReport = {
  /** Contract violations; the build fails. */
  errors: string[];
  /** Printability concerns; the build succeeds and the UI and README show them. */
  warnings: string[];
};

const PART_NAME = /^[A-Za-z0-9_-]+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Float32 vertices from boolean ops land within this of z = 0 when a part sits on the bed. */
const BED_CONTACT_TOLERANCE_MM = 1e-3;

const mm = (value: number) => `${Math.round(value * 10) / 10}`;

/** Checks a build result against the part contract and the printer's bed. */
export function checkResult(result: GeneratorResult, bed: PrintBed): CheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (result.parts.length === 0) errors.push("Generator produced no parts");

  const seen = new Set<string>();
  for (const part of result.parts) {
    const label = `Part "${part.name}"`;
    if (!PART_NAME.test(part.name)) errors.push(`${label}: name must match [A-Za-z0-9_-]+`);
    if (seen.has(part.name)) errors.push(`${label}: duplicate part name`);
    seen.add(part.name);
    if (part.quantity !== undefined && !(Number.isInteger(part.quantity) && part.quantity >= 1)) {
      errors.push(`${label}: quantity must be a whole number of at least 1`);
    }
    if (part.color !== undefined && !HEX_COLOR.test(part.color)) {
      errors.push(`${label}: color must be #rrggbb`);
    }

    const bounds = boundsOf([part.mesh]);
    if (!bounds || part.mesh.indices.length === 0) {
      errors.push(`${label}: mesh is empty`);
      continue;
    }
    const [sx, sy, sz] = [0, 1, 2].map((k) => bounds.max[k] - bounds.min[k]);
    // A part fits if it fits either way round on the plate.
    const [footLong, footShort] = [Math.max(sx, sy), Math.min(sx, sy)];
    const [bedLong, bedShort] = [Math.max(bed.width, bed.depth), Math.min(bed.width, bed.depth)];
    if (footLong > bedLong || footShort > bedShort || sz > bed.height) {
      warnings.push(
        `${label} (${mm(sx)} x ${mm(sy)} x ${mm(sz)} mm) does not fit the ` +
          `${bed.width} x ${bed.depth} x ${bed.height} mm build volume`,
      );
    }
    if (Math.abs(bounds.min[2]) > BED_CONTACT_TOLERANCE_MM) {
      warnings.push(`${label} does not rest on the bed (lowest point at z = ${mm(bounds.min[2])} mm)`);
    }
  }
  return { errors, warnings };
}

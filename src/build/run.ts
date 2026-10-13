import { PRINT_BED } from "../app-config";
import { checkResult } from "../core/checks";
import { getManifold } from "../core/manifold";
import { validateParams } from "../core/params";
import type { GeneratorResult, Params } from "../core/types";
import { findGenerator } from "../generators";
import { loadBuild } from "../generators/builds";

/**
 * The worker's whole pipeline: validate, lazy-load the generator's build, run it, then check the
 * result. Contract errors throw; printability warnings are appended to the result's own.
 */
export async function runBuild(generatorId: string, params: Params): Promise<GeneratorResult> {
  const def = findGenerator(generatorId);
  if (!def) throw new Error(`Unknown generator "${generatorId}"`);
  const issues = validateParams(def, params);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join("; "));

  const [build, wasm] = await Promise.all([loadBuild(def.id), getManifold()]);
  const result = await build(params, { wasm });
  const { errors, warnings } = checkResult(result, PRINT_BED);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return { ...result, warnings: [...(result.warnings ?? []), ...warnings] };
}

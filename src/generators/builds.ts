import type { GeneratorBuild } from "../core/types";

// Lazy: each generator's geometry code becomes its own chunk, loaded on first build.
const loaders = import.meta.glob<GeneratorBuild>("./*/build.ts", { import: "default" });

/** Loads `src/generators/<id>/build.ts`. Worker-only; the main thread never imports this. */
export function loadBuild(id: string): Promise<GeneratorBuild> {
  const load = loaders[`./${id}/build.ts`];
  if (!load) return Promise.reject(new Error(`Generator "${id}" has no build.ts`));
  return load();
}

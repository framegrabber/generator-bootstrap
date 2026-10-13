import type { GeneratorDef } from "../core/types";

/**
 * Builds the registry from `<id>/index.ts` modules. Throws on a folder/id mismatch, because the
 * worker finds a generator's build module by its id.
 */
export function collectGenerators(modules: Record<string, GeneratorDef>): GeneratorDef[] {
  const defs = Object.entries(modules).map(([path, def]) => {
    const folder = path.split("/").at(-2);
    if (folder !== def.id) {
      throw new Error(`Generator in folder "${folder}" declares id "${def.id}"; they must match`);
    }
    return def;
  });
  return defs.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every generator folder with an `index.ts`, sorted by name. The first entry is the default. */
export const GENERATORS: readonly GeneratorDef[] = collectGenerators(
  import.meta.glob<GeneratorDef>("./*/index.ts", { eager: true, import: "default" }),
);

export function findGenerator(
  id: string,
  generators: readonly GeneratorDef[] = GENERATORS,
): GeneratorDef | undefined {
  return generators.find((g) => g.id === id);
}

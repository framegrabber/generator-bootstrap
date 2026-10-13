import type { GeneratorDef } from "../core/types";
import { roundedTag } from "./rounded-tag";

/** Every generator the app offers. The first entry is the default. */
export const GENERATORS: readonly GeneratorDef[] = [roundedTag];

export function findGenerator(
  id: string,
  generators: readonly GeneratorDef[] = GENERATORS,
): GeneratorDef | undefined {
  return generators.find((g) => g.id === id);
}

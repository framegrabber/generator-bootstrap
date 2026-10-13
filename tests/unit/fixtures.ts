import type { GeneratorDef } from "../../src/core/types";
import type * as Registry from "../../src/generators";

/**
 * Test-only generator for infrastructure tests (persistence, settings, build scheduling,
 * export). Using it instead of a real generator keeps those tests passing when the app's
 * generators change or the example is deleted. It has no build; tests that need geometry
 * fake the build or the parts.
 */
export const FIXTURE: GeneratorDef = {
  id: "fixture",
  name: "Fixture",
  description: "Test-only generator.",
  params: [
    { kind: "number", key: "width", label: "Width", unit: "mm", default: 40, min: 1, max: 100 },
    { kind: "number", key: "height", label: "Height", unit: "mm", default: 20, min: 1, max: 100 },
    { kind: "boolean", key: "hole", label: "Hole", default: true },
    {
      kind: "number",
      key: "holeDiameter",
      label: "Hole diameter",
      unit: "mm",
      default: 4,
      min: 1,
      visibleWhen: (values) => values.hole === true,
    },
  ],
};

/**
 * Registry module whose only generator is FIXTURE. For code that reads the global registry:
 *
 *   vi.mock(import("../../../src/generators"), async (importOriginal) =>
 *     (await import("../fixtures")).fixtureRegistry(await importOriginal()));
 */
export function fixtureRegistry(actual: typeof Registry): typeof Registry {
  const generators = [FIXTURE];
  return {
    ...actual,
    GENERATORS: generators,
    findGenerator: (id, list = generators) => actual.findGenerator(id, list),
  };
}

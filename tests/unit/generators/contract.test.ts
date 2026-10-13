import { describe, expect, it } from "vitest";
import { defaultParams, validateParams } from "../../../src/core/params";
import type { GeneratorDef } from "../../../src/core/types";
import { collectGenerators, GENERATORS } from "../../../src/generators";
import { buildWith, signedVolume } from "./helpers";

// Runs for every generator folder, so a new generator is covered without writing a test.
describe.each(GENERATORS.map((def) => [def.id, def] as const))("generator %s", (id, def) => {
  it("accepts its own defaults", () => {
    expect(validateParams(def, defaultParams(def.params))).toEqual([]);
  });

  it("builds its defaults into closed, printable parts without warnings", async () => {
    const result = await buildWith(id);
    expect(result.warnings).toEqual([]);
    for (const part of result.parts) {
      expect(signedVolume(part.mesh), `part ${part.name} volume`).toBeGreaterThan(0);
    }
  });
});

describe("collectGenerators", () => {
  const def = { id: "tag", name: "Tag", description: "", params: [] } satisfies GeneratorDef;

  it("rejects a folder whose name differs from the generator id", () => {
    expect(() => collectGenerators({ "./other/index.ts": def })).toThrow(/folder "other".*"tag"/);
  });

  it("sorts generators by name", () => {
    const zed = { ...def, id: "zed", name: "Zed" };
    const alpha = { ...def, id: "alpha", name: "Alpha" };
    const sorted = collectGenerators({ "./zed/index.ts": zed, "./alpha/index.ts": alpha });
    expect(sorted.map((d) => d.id)).toEqual(["alpha", "zed"]);
  });
});

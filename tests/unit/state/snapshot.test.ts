import { describe, expect, it } from "vitest";
import { defaultSnapshot, restoreSnapshot } from "../../../src/state/snapshot";
import type { GeneratorDef } from "../../../src/core/types";
import { roundedTag } from "../../../src/generators/rounded-tag";

const generators: GeneratorDef[] = [roundedTag];

describe("restoreSnapshot", () => {
  it("falls back to defaults for non-object input", () => {
    expect(restoreSnapshot("garbage", generators)).toEqual(defaultSnapshot(generators));
    expect(restoreSnapshot([1, 2], generators)).toEqual(defaultSnapshot(generators));
    expect(restoreSnapshot(null, generators)).toEqual(defaultSnapshot(generators));
  });

  it("falls back to defaults for an unknown generator id", () => {
    const restored = restoreSnapshot({ generator: "no-such", values: { width: 99 } }, generators);
    expect(restored).toEqual(defaultSnapshot(generators));
  });

  it("keeps valid values and fills mistyped or missing keys from defaults", () => {
    const restored = restoreSnapshot(
      {
        generator: "rounded-tag",
        values: { width: 60, height: "tall", hole: false, unknownKey: 1 },
      },
      generators,
    );
    expect(restored.generator).toBe("rounded-tag");
    expect(restored.values.width).toBe(60);
    expect(restored.values.height).toBe(roundedTag.params[1].default);
    expect(restored.values.hole).toBe(false);
    expect(restored.values).not.toHaveProperty("unknownKey");
  });

  it("applies the generator's migrate hook before merging", () => {
    const legacy: GeneratorDef = {
      ...roundedTag,
      migrate: (raw) => ({ ...raw, width: raw.oldWidth }),
    };
    const restored = restoreSnapshot(
      { generator: "rounded-tag", values: { oldWidth: 77 } },
      [legacy],
    );
    expect(restored.values.width).toBe(77);
  });
});

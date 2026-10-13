import { describe, expect, it } from "vitest";
import { defaultParams, matchesSpec, validateParams } from "../../../src/core/params";
import type { GeneratorDef, ParamSpec } from "../../../src/core/types";

const specs: ParamSpec[] = [
  { kind: "number", key: "size", label: "Size", default: 10, min: 1 },
  { kind: "boolean", key: "on", label: "On", default: true },
  { kind: "text", key: "name", label: "Name", default: "a", maxLength: 3 },
  {
    kind: "select",
    key: "mode",
    label: "Mode",
    default: "x",
    options: [
      { value: "x", label: "X" },
      { value: "y", label: "Y" },
    ],
  },
];

function def(overrides: Partial<GeneratorDef> = {}): GeneratorDef {
  return {
    id: "test",
    name: "Test",
    description: "",
    params: specs,
    build: async () => ({ parts: [] }),
    ...overrides,
  };
}

describe("matchesSpec", () => {
  it("rejects NaN and Infinity for number params", () => {
    expect(matchesSpec(specs[0], Number.NaN)).toBe(false);
    expect(matchesSpec(specs[0], Number.POSITIVE_INFINITY)).toBe(false);
    expect(matchesSpec(specs[0], 0)).toBe(true);
  });

  it("enforces text maxLength", () => {
    expect(matchesSpec(specs[2], "abc")).toBe(true);
    expect(matchesSpec(specs[2], "abcd")).toBe(false);
  });

  it("only accepts declared select options", () => {
    expect(matchesSpec(specs[3], "y")).toBe(true);
    expect(matchesSpec(specs[3], "z")).toBe(false);
  });
});

describe("validateParams", () => {
  it("reports wrong-typed values and skips the generator's validate", () => {
    const validate = (): never => {
      throw new Error("must not run on type-invalid input");
    };
    const values = { ...defaultParams(specs), size: "big" as unknown as number };
    const issues = validateParams(def({ validate }), values);
    expect(issues).toEqual([{ key: "size", message: "Size: invalid value" }]);
  });

  it("reports values below min", () => {
    const issues = validateParams(def(), { ...defaultParams(specs), size: 0 });
    expect(issues).toEqual([{ key: "size", message: "Size must be at least 1" }]);
  });

  it("returns the generator's own issues when generic checks pass", () => {
    const validate = () => [{ key: null, message: "cross-field problem" }];
    const issues = validateParams(def({ validate }), defaultParams(specs));
    expect(issues).toEqual([{ key: null, message: "cross-field problem" }]);
  });
});

import { describe, expect, it } from "vitest";
import { defaultParams, matchesSpec, validateParams } from "../../../src/core/params";
import type { GeneratorDef, ParamSpec } from "../../../src/core/types";

const specs: ParamSpec[] = [
  { kind: "number", key: "size", label: "Size", default: 10, min: 1, max: 20 },
  {
    kind: "number",
    key: "count",
    label: "Count",
    default: 2,
    min: 1,
    integer: true,
    visibleWhen: (values) => values.on === true,
  },
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
    expect(matchesSpec(specs[3], "abc")).toBe(true);
    expect(matchesSpec(specs[3], "abcd")).toBe(false);
  });

  it("only accepts declared select options", () => {
    expect(matchesSpec(specs[4], "y")).toBe(true);
    expect(matchesSpec(specs[4], "z")).toBe(false);
  });
});

describe("matchesSpec for color, font, and multiline text", () => {
  const color = { kind: "color", key: "c", label: "C", default: "#000000" } as const;
  const font = { kind: "font", key: "f", label: "F", default: "bundled:inter" } as const;
  const line = { kind: "text", key: "t", label: "T", default: "" } as const;

  it("accepts only #rrggbb colours", () => {
    expect(matchesSpec(color, "#a1B2c3")).toBe(true);
    expect(matchesSpec(color, "#abc")).toBe(false);
    expect(matchesSpec(color, "red")).toBe(false);
  });

  it("accepts known bundled fonts and well-formed upload hashes", () => {
    expect(matchesSpec(font, "bundled:inter")).toBe(true);
    expect(matchesSpec(font, "bundled:comic-sans")).toBe(false);
    expect(matchesSpec(font, `upload:${"ab".repeat(32)}`)).toBe(true);
    expect(matchesSpec(font, "upload:abc")).toBe(false);
  });

  it("rejects line breaks unless the text param is multiline", () => {
    expect(matchesSpec(line, "a\nb")).toBe(false);
    expect(matchesSpec({ ...line, multiline: true }, "a\nb")).toBe(true);
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

  it("reports values above max", () => {
    const issues = validateParams(def(), { ...defaultParams(specs), size: 21 });
    expect(issues).toEqual([{ key: "size", message: "Size must be at most 20" }]);
  });

  it("rejects fractions for integer params", () => {
    const issues = validateParams(def(), { ...defaultParams(specs), count: 1.5 });
    expect(issues).toEqual([{ key: "count", message: "Count must be a whole number" }]);
  });

  it("skips range checks for hidden params but still type-checks them", () => {
    const hidden = { ...defaultParams(specs), on: false, count: 0 };
    expect(validateParams(def(), hidden)).toEqual([]);
    const mistyped = { ...hidden, count: "two" as unknown as number };
    expect(validateParams(def(), mistyped)).toEqual([{ key: "count", message: "Count: invalid value" }]);
  });
});

import { describe, expect, it } from "vitest";
import { checkResult, type PrintBed } from "../../../src/core/checks";
import type { Part } from "../../../src/core/types";

const BED: PrintBed = { width: 200, depth: 100, height: 50 };

/** A single triangle spanning the box [0, x] x [0, y] x [z0, z0 + z]. */
function boxPart(name: string, [x, y, z]: [number, number, number], z0 = 0): Part {
  return {
    name,
    mesh: {
      positions: new Float32Array([0, 0, z0, x, 0, z0, 0, y, z0 + z]),
      indices: new Uint32Array([0, 1, 2]),
    },
  };
}

describe("checkResult", () => {
  it("passes a part that fits only when rotated 90 degrees on the plate", () => {
    expect(checkResult({ parts: [boxPart("a", [90, 150, 10])] }, BED)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("warns when a part exceeds the plate footprint or height", () => {
    const { errors, warnings } = checkResult(
      { parts: [boxPart("wide", [210, 10, 10]), boxPart("tall", [10, 10, 60])] },
      BED,
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/Part "wide" \(210 x 10 x 10 mm\) does not fit/);
  });

  it("warns when a part floats above the bed", () => {
    const { warnings } = checkResult({ parts: [boxPart("float", [10, 10, 10], 2)] }, BED);
    expect(warnings).toEqual([
      'Part "float" does not rest on the bed (lowest point at z = 2 mm)',
    ]);
  });

  it("rejects duplicate names, unsafe names, empty meshes, and bad metadata", () => {
    const empty: Part = { name: "empty", mesh: { positions: new Float32Array(), indices: new Uint32Array() } };
    const { errors } = checkResult(
      {
        parts: [
          boxPart("dup", [1, 1, 1]),
          boxPart("dup", [1, 1, 1]),
          boxPart("bad name", [1, 1, 1]),
          { ...boxPart("q", [1, 1, 1]), quantity: 1.5 },
          { ...boxPart("c", [1, 1, 1]), color: "red" },
          empty,
        ],
      },
      BED,
    );
    expect(errors).toEqual([
      'Part "dup": duplicate part name',
      'Part "bad name": name must match [A-Za-z0-9_-]+',
      'Part "q": quantity must be a whole number of at least 1',
      'Part "c": color must be #rrggbb',
      'Part "empty": mesh is empty',
    ]);
  });

  it("rejects a result without parts", () => {
    expect(checkResult({ parts: [] }, BED).errors).toEqual(["Generator produced no parts"]);
  });
});

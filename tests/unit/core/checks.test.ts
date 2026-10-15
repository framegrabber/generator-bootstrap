import { describe, expect, it } from "vitest";
import { checkResult, type PrintBed } from "../../../src/core/checks";
import { IDENTITY, type Mat4 } from "../../../src/core/mat4";
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
    expect(warnings).toEqual(['Part "float" does not rest on the bed (lowest point at z = 2 mm)']);
  });

  it("rejects duplicate names, unsafe names, empty meshes, and bad metadata", () => {
    const empty: Part = {
      name: "empty",
      mesh: { positions: new Float32Array(), indices: new Uint32Array() },
    };
    const { errors } = checkResult(
      {
        parts: [
          boxPart("dup", [1, 1, 1]),
          boxPart("dup", [1, 1, 1]),
          boxPart("bad name", [1, 1, 1]),
          { ...boxPart("q", [1, 1, 1]), quantity: 1.5 },
          { ...boxPart("c", [1, 1, 1]), color: "red" },
          empty,
          { ...boxPart("m", [1, 1, 1]), assembled: [...IDENTITY.slice(0, 15), NaN] as Mat4 },
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
      'Part "m": assembled must be 16 finite numbers',
    ]);
  });

  it("rejects a result without parts", () => {
    expect(checkResult({ parts: [] }, BED).errors).toEqual(["Generator produced no parts"]);
  });

  it("checks an assembly as one group: only the group must rest on the bed", () => {
    const plate = { ...boxPart("plate", [40, 20, 3]), assembly: "tag" };
    const text = { ...boxPart("text", [30, 10, 1], 3), assembly: "tag" };
    expect(checkResult({ parts: [plate, text] }, BED)).toEqual({ errors: [], warnings: [] });
    const floating = { ...boxPart("text", [30, 10, 1], 3), assembly: "label" };
    expect(checkResult({ parts: [plate, floating] }, BED).warnings).toEqual([
      'Assembly "label" does not rest on the bed (lowest point at z = 3 mm)',
    ]);
  });

  it("warns when an assembly as a whole exceeds the bed", () => {
    const left = { ...boxPart("a", [150, 10, 1]), assembly: "pair" };
    const right = { ...boxPart("b", [150, 10, 1]), assembly: "pair" };
    right.mesh.positions = right.mesh.positions.map((v, i) => (i % 3 === 0 ? v + 100 : v));
    expect(checkResult({ parts: [left, right] }, BED).warnings).toEqual([
      'Assembly "pair" (250 x 10 x 1 mm) does not fit the 200 x 100 x 50 mm build volume',
    ]);
  });

  it("rejects assemblies whose parts disagree on quantity, and unsafe assembly names", () => {
    const a = { ...boxPart("a", [1, 1, 1]), assembly: "g", quantity: 2 };
    const b = { ...boxPart("b", [1, 1, 1]), assembly: "g" };
    expect(checkResult({ parts: [a, b] }, BED).errors).toEqual([
      'Assembly "g": all parts of an assembly must have the same quantity',
    ]);
    const bad = { ...boxPart("c", [1, 1, 1]), assembly: "my tag" };
    expect(checkResult({ parts: [bad] }, BED).errors).toEqual([
      'Part "c": assembly must match [A-Za-z0-9_-]+',
    ]);
  });
});

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportEntries } from "../../../src/exporters/export";
import { modelXml } from "../../../src/exporters/formats/threemf";
import type { GeneratorResult, Part } from "../../../src/core/types";
import { defaultParams } from "../../../src/core/params";
import { FIXTURE } from "../fixtures";

/** Unit right triangle at the origin, 10 mm wide. */
function part(name: string, extra: Partial<Part> = {}): Part {
  return {
    name,
    mesh: {
      positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
      indices: new Uint32Array([0, 1, 2]),
    },
    ...extra,
  };
}

const count = (xml: string, tag: string) => xml.split(`<${tag} `).length - 1;

describe("modelXml", () => {
  it("writes one object per part and one build item per copy, laid out without overlap", () => {
    const xml = modelXml([part("a", { quantity: 3 }), part("b")], "App");
    expect(count(xml, "object")).toBe(2);
    expect(count(xml, "vertex")).toBe(6);
    expect(count(xml, "triangle")).toBe(2);
    const offsets = [...xml.matchAll(/transform="1 0 0 0 1 0 0 0 1 ([\d.-]+) /g)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toEqual([0, 15, 30, 45]);
  });

  it("assigns display colours only to parts that declare one", () => {
    const xml = modelXml([part("plain"), part("red", { color: "#ff0000" })], "App");
    expect(xml).toContain('<base name="red" displaycolor="#ff0000"/>');
    expect(xml).toContain('<object id="2" type="model" name="plain">');
    expect(xml).toContain('<object id="3" type="model" name="red" pid="1" pindex="0">');
  });

  it("wraps an assembly's parts in one component object placed once per copy", () => {
    const xml = modelXml(
      [
        part("plate", { assembly: "tag", color: "#ffffff", quantity: 2 }),
        part("text", { assembly: "tag", color: "#000000", quantity: 2 }),
        part("loose"),
      ],
      "App",
    );
    expect(xml).toContain(
      '<object id="5" type="model" name="tag"><components><component objectid="2"/><component objectid="3"/></components></object>',
    );
    const items = [...xml.matchAll(/<item objectid="(\d+)"/g)].map((m) => Number(m[1]));
    expect(items).toEqual([5, 5, 4]);
  });

  it("escapes XML in names", () => {
    expect(modelXml([part("a")], 'A&B "app"')).toContain(
      '<metadata name="Application">A&amp;B &quot;app&quot;</metadata>',
    );
  });
});

describe("exportEntries", () => {
  const def = FIXTURE;
  const values = defaultParams(FIXTURE.params);
  const result: GeneratorResult = {
    parts: [part("tag", { quantity: 2 })],
    extraFiles: [{ path: "notes.txt", content: "hi" }],
    warnings: ["careful"],
  };
  const input = { def, values, result, reproduceUrl: "https://x.test/?p=1" };

  it("names STL files with their quantity and lists parts in the README", async () => {
    const entries = await exportEntries({ ...input, format: "stl" });
    expect(entries.map((e) => e.path)).toEqual(["stl/01_tag_x2.stl", "notes.txt", "README.txt"]);
    const readme = String(entries.at(-1)!.data);
    expect(readme).toContain("  tag x 2");
    expect(readme).toContain("  careful");
  });

  it("puts each assembly's STL files in one folder, quantity on the folder", async () => {
    const parts = [
      part("plate", { assembly: "tag", quantity: 3 }),
      part("text", { assembly: "tag", quantity: 3 }),
      part("ring"),
    ];
    const entries = await exportEntries({ ...input, result: { parts }, format: "stl" });
    expect(entries.map((e) => e.path)).toEqual([
      "stl/01_tag_x3/plate.stl",
      "stl/01_tag_x3/text.stl",
      "stl/02_ring.stl",
      "README.txt",
    ]);
    expect(String(entries.at(-1)!.data)).toContain("  tag/plate x 3");
  });

  it("packs a valid 3MF package for the 3mf format", async () => {
    const entries = await exportEntries({ ...input, format: "3mf" });
    expect(entries.map((e) => e.path)).toEqual(["fixture.3mf", "notes.txt", "README.txt"]);
    const pkg = await JSZip.loadAsync(entries[0].data as ArrayBuffer);
    expect(Object.keys(pkg.files).sort()).toEqual([
      "3D/",
      "3D/3dmodel.model",
      "[Content_Types].xml",
      "_rels/",
      "_rels/.rels",
    ]);
    expect(count(await pkg.file("3D/3dmodel.model")!.async("string"), "item")).toBe(2);
  });

  it("omits hidden params from the README", async () => {
    const entries = await exportEntries({
      ...input,
      values: { ...values, hole: false },
      format: "stl",
    });
    expect(String(entries.at(-1)!.data)).not.toContain("Hole diameter");
  });
});

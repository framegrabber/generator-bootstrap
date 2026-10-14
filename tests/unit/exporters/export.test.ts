import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportEntries } from "../../../src/exporters/export";
import {
  bambuModelSettingsXml,
  filamentNumbers,
  modelXml,
} from "../../../src/exporters/formats/threemf";
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
  it("places every copy as its own object, laid out in a row without overlap", () => {
    const xml = modelXml([part("a", { quantity: 3 }), part("b")], "App");
    expect(count(xml, "vertex")).toBe(6);
    expect(count(xml, "triangle")).toBe(2);
    const items = [...xml.matchAll(/<item objectid="(\d+)"/g)].map((m) => Number(m[1]));
    expect(items).toEqual([4, 5, 6, 7]);
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

  it("wraps an assembly's parts in one component object per copy", () => {
    const xml = modelXml(
      [
        part("plate", { assembly: "tag", color: "#ffffff", quantity: 2 }),
        part("text", { assembly: "tag", color: "#000000", quantity: 2 }),
        part("loose"),
      ],
      "App",
    );
    for (const id of [5, 6]) {
      expect(xml).toContain(
        `<object id="${id}" type="model" name="tag"><components><component objectid="2"/><component objectid="3"/></components></object>`,
      );
    }
    const items = [...xml.matchAll(/<item objectid="(\d+)"/g)].map((m) => Number(m[1]));
    expect(items).toEqual([5, 6, 7]);
  });

  it("escapes XML in names", () => {
    expect(modelXml([part("a")], 'A&B "app"')).toContain(
      '<metadata name="Application">A&amp;B &quot;app&quot;</metadata>',
    );
  });
});

describe("filamentNumbers", () => {
  it("gives each distinct colour the next filament, ignoring case; uncoloured parts use 1", () => {
    const parts = [
      part("a", { color: "#FF0000" }),
      part("b"),
      part("c", { color: "#00ff00" }),
      part("d", { color: "#ff0000" }),
    ];
    expect([...filamentNumbers(parts).values()]).toEqual([1, 1, 2, 1]);
  });
});

describe("bambuModelSettingsXml", () => {
  it("names every object and part and puts each part on its colour's filament", () => {
    const xml = bambuModelSettingsXml([
      part("plate", { assembly: "tag", color: "#ffffff", quantity: 2 }),
      part("text", { assembly: "tag", color: "#000000", quantity: 2 }),
    ]);
    const objects = xml.match(/<object id="\d+">.*?<\/object>/g) ?? [];
    expect(objects).toHaveLength(2);
    for (const object of objects) {
      expect(object).toMatch(/^<object id="\d+"><metadata key="name" value="tag"\/>/);
      expect(object).toContain(
        '<part id="2" subtype="normal_part"><metadata key="name" value="plate"/><metadata key="extruder" value="1"/></part>',
      );
      expect(object).toContain(
        '<part id="3" subtype="normal_part"><metadata key="name" value="text"/><metadata key="extruder" value="2"/></part>',
      );
    }
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

  it("always ships the 3MF and the STL files, and explains both in the README", async () => {
    const entries = await exportEntries(input);
    expect(entries.map((e) => e.path)).toEqual([
      "fixture.3mf",
      "tag-x2.stl",
      "notes.txt",
      "README.txt",
    ]);
    const readme = String(entries.at(-1)!.data);
    expect(readme).toContain("  tag x 2 (filament 1)");
    expect(readme).toMatch(/Which file to use:\n {2}3MF: .*\n {2}\*\.stl: /);
    expect(readme).toContain("  careful");
  });

  it("names STL files after their assembly and part, flat, with the copy count", async () => {
    const parts = [
      part("plate", { assembly: "tag", quantity: 3 }),
      part("text", { assembly: "tag", quantity: 3, color: "#ff0000" }),
      part("ring"),
    ];
    const entries = await exportEntries({ ...input, result: { parts } });
    expect(entries.map((e) => e.path).filter((p) => p.endsWith(".stl"))).toEqual([
      "tag-plate-x3.stl",
      "tag-text-x3.stl",
      "ring.stl",
    ]);
    expect(String(entries.at(-1)!.data)).toContain("  tag/text x 3 (filament 1, colour #ff0000)");
  });

  it("packs a 3MF package with the model and Bambu Studio part settings", async () => {
    const entries = await exportEntries(input);
    const pkg = await JSZip.loadAsync(entries[0].data as ArrayBuffer);
    expect(Object.keys(pkg.files).sort()).toEqual([
      "3D/",
      "3D/3dmodel.model",
      "Metadata/",
      "Metadata/model_settings.config",
      "[Content_Types].xml",
      "_rels/",
      "_rels/.rels",
    ]);
    expect(count(await pkg.file("3D/3dmodel.model")!.async("string"), "item")).toBe(2);
  });

  it("omits hidden params from the README", async () => {
    const entries = await exportEntries({ ...input, values: { ...values, hole: false } });
    expect(String(entries.at(-1)!.data)).not.toContain("Hole diameter");
  });
});

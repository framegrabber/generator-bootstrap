import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { bundleZip } from "../../../src/exporters/zip";

describe("bundleZip", () => {
  it("packs every entry at its path with the original bytes", async () => {
    const blob = await bundleZip([
      { path: "README.txt", data: "hello" },
      { path: "stl/01_tag.stl", data: new Uint8Array([1, 2, 3]).buffer },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("README.txt")?.async("string")).toBe("hello");
    expect(Array.from(new Uint8Array(await zip.file("stl/01_tag.stl")!.async("uint8array")))).toEqual([
      1, 2, 3,
    ]);
  });

  it("refuses duplicate paths instead of overwriting", async () => {
    await expect(
      bundleZip([
        { path: "a.txt", data: "1" },
        { path: "a.txt", data: "2" },
      ]),
    ).rejects.toThrow(/Duplicate zip entry: a.txt/);
  });
});

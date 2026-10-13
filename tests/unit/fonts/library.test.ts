import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { addUploadedFont, listUploadedFonts, removeUploadedFont } from "../../../src/fonts/library";
import { loadFont } from "../../../src/fonts/load";

const inter = (await readFile("src/fonts/files/Inter-Regular.ttf")).buffer as ArrayBuffer;

describe("uploaded font library", () => {
  it("stores a font once by content hash and loads it through its upload reference", async () => {
    const first = await addUploadedFont("Inter.ttf", inter);
    const again = await addUploadedFont("copy.ttf", inter);
    expect(again).toEqual(first);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await listUploadedFonts()).toEqual([first]);

    const font = await loadFont(`upload:${first.sha256}`);
    expect(font.unitsPerEm).toBe(2048);

    await removeUploadedFont(first.sha256);
    expect(await listUploadedFonts()).toEqual([]);
  });

  it("rejects files that are not fonts", async () => {
    await expect(
      addUploadedFont("notes.txt", new TextEncoder().encode("hello").buffer),
    ).rejects.toThrow(/not a TTF, OTF, or WOFF/);
  });

  it("explains that an uploaded font from another browser has to be uploaded again", async () => {
    await expect(loadFont(`upload:${"0".repeat(64)}`)).rejects.toThrow(
      /not stored in this browser/,
    );
  });
});

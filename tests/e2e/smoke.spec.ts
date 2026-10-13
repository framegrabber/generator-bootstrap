import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("edit parameters, build, download a zip, and keep values across reload", async ({ page }) => {
  await page.goto("/");

  const width = page.getByLabel("Width");
  const height = page.getByLabel("Height");
  await width.fill("60");
  await height.fill("30");

  const download = page.getByRole("button", { name: "Download ZIP" });
  await expect(download).toBeEnabled({ timeout: 30_000 });

  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^generator-60x30-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const zip = await JSZip.loadAsync(await readFile(await file.path()));
  const names = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
  expect(names).toEqual(["README.txt", "stl/01_tag.stl"]);

  const stl = await zip.file("stl/01_tag.stl")!.async("uint8array");
  const triangles = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
  expect(stl.byteLength).toBe(84 + 50 * triangles);
  expect(triangles).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByLabel("Width")).toHaveValue("60");
  await expect(page.getByLabel("Height")).toHaveValue("30");
});

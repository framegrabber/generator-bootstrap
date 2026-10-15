import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

// The default generator (first by name) is "Display dog"; the first test drives it through
// build and export. The name-tag tests select their generator explicitly.

async function downloadZip(page: Page): Promise<{ filename: string; zip: JSZip }> {
  const button = page.getByRole("button", { name: "Download ZIP" });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return {
    filename: file.suggestedFilename(),
    zip: await JSZip.loadAsync(await readFile(await file.path())),
  };
}

test("build the default dog and download a zip with every part", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Generator")).toHaveValue("display-dog");
  await page.getByLabel("Ears", { exact: true }).selectOption("floppy");

  const { filename, zip } = await downloadZip(page);
  expect(filename).toMatch(/^generator-display-dog-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);
  const names = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .sort();
  // Floppy ears have no inner-ear accent; the nose prints in place on the head front.
  expect(names).toEqual([
    "ASSEMBLY.txt",
    "README.txt",
    "body.stl",
    "display-dog.3mf",
    "face-head-front.stl",
    "face-nose.stl",
    "head-back.stl",
  ]);
});

test("edit parameters, build, download a zip, and keep values across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Generator").selectOption("name-tag");
  await page.getByLabel("Text", { exact: true }).fill("Ada\nLovelace");
  await page.getByLabel("Letter height").fill("10");

  const { filename, zip } = await downloadZip(page);
  expect(filename).toMatch(/^generator-Ada-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);
  const names = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .sort();
  expect(names).toEqual(["README.txt", "name-tag.3mf", "tag-plate.stl", "tag-text.stl"]);

  const stl = await zip.file("tag-text.stl")!.async("uint8array");
  const triangles = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
  expect(stl.byteLength).toBe(84 + 50 * triangles);
  expect(triangles).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByLabel("Generator")).toHaveValue("name-tag");
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Ada\nLovelace");
  await expect(page.getByLabel("Letter height")).toHaveValue("10");
});

test("upload a font, embed coloured text, and export a two-colour 3MF", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Generator").selectOption("name-tag");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload font" }).click(),
  ]);
  await chooser.setFiles("src/fonts/files/Inter-Regular.ttf");
  await expect(page.getByLabel("Font")).toHaveValue(/^upload:[0-9a-f]{64}$/);
  await expect(page.getByRole("button", { name: "Remove font" })).toBeVisible();

  await page.getByLabel("Text style").selectOption("embedded");
  await expect(page.getByLabel("Inlay depth")).toBeVisible();
  await page.getByLabel("Text colour").fill("#ff0000");

  const { zip } = await downloadZip(page);
  const pkg = await JSZip.loadAsync(await zip.file("name-tag.3mf")!.async("uint8array"));
  const model = await pkg.file("3D/3dmodel.model")!.async("string");
  expect(model).toContain('displaycolor="#ff0000"');
  expect(model).toMatch(/<object id="\d+" type="model" name="tag"><components>/);
  const settings = await pkg.file("Metadata/model_settings.config")!.async("string");
  expect(settings).toContain(
    '<metadata key="name" value="text"/><metadata key="extruder" value="2"/>',
  );
  const readme = await zip.file("README.txt")!.async("string");
  expect(readme).toMatch(/Font: uploaded font, SHA-256 [0-9a-f]{64}/);

  await page.getByLabel("Text style").selectOption("cutout");
  await expect(page.getByLabel("Text colour")).toBeHidden();
});

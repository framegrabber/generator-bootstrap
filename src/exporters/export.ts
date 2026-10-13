import { APP } from "../app-config";
import type { GeneratorDef, GeneratorResult, Params, Part } from "../core/types";
import { sanitizeSegment } from "./filename";
import { meshToBinaryStl } from "./formats/stl";
import { partsTo3mf } from "./formats/threemf";
import { buildReadme } from "./readme";
import type { ZipEntry } from "./zip";

export type ExportFormatId = "stl" | "3mf";

/** A mesh file format: turns the result's parts into ZIP entries. */
export type ExportFormat = {
  label: string;
  files: (parts: readonly Part[], generatorId: string) => Promise<ZipEntry[]>;
};

export const EXPORT_FORMATS: Record<ExportFormatId, ExportFormat> = {
  stl: {
    label: "STL (one file per part)",
    // STL has no notion of copies, so the file name carries the quantity.
    files: async (parts) =>
      parts.map((part, index) => {
        const copies = (part.quantity ?? 1) > 1 ? `_x${part.quantity}` : "";
        const stem = `${String(index + 1).padStart(2, "0")}_${sanitizeSegment(part.name)}${copies}`;
        return { path: `stl/${stem}.stl`, data: meshToBinaryStl(part.mesh, `${APP.name} ${part.name}`) };
      }),
  },
  "3mf": {
    label: "3MF (all parts and copies on one plate)",
    files: async (parts, generatorId) => [
      { path: `${sanitizeSegment(generatorId)}.3mf`, data: await partsTo3mf(parts, APP.name) },
    ],
  },
};

export type ExportInput = {
  def: GeneratorDef;
  values: Params;
  result: GeneratorResult;
  format: ExportFormatId;
  reproduceUrl: string;
};

/** Every file of an export ZIP: the format's mesh files, the generator's extras, and a README. */
export async function exportEntries({
  def,
  values,
  result,
  format,
  reproduceUrl,
}: ExportInput): Promise<ZipEntry[]> {
  const entries = await EXPORT_FORMATS[format].files(result.parts, def.id);
  for (const file of result.extraFiles ?? []) entries.push({ path: file.path, data: file.content });
  entries.push({
    path: "README.txt",
    data: buildReadme({
      appName: APP.name,
      generatorName: def.name,
      params: def.params,
      values,
      parts: result.parts.map((p) => ({ name: p.name, quantity: p.quantity ?? 1 })),
      reproduceUrl,
      files: entries.map((e) => e.path),
      warnings: result.warnings ?? [],
    }),
  });
  return entries;
}

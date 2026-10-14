import { APP } from "../app-config";
import { printGroups } from "../core/assembly";
import type { GeneratorDef, GeneratorResult, Params, Part } from "../core/types";
import { sanitizeSegment } from "./filename";
import { meshToBinaryStl } from "./formats/stl";
import { filamentNumbers, partsTo3mf } from "./formats/threemf";
import { buildReadme } from "./readme";
import type { ZipEntry } from "./zip";

/** A mesh file format. Every export ZIP contains every format, so users never have to choose. */
export type MeshFormat = {
  /** One README line telling the user what these files are for. */
  note: string;
  files: (parts: readonly Part[], generatorId: string) => Promise<ZipEntry[]>;
};

export const MESH_FORMATS: readonly MeshFormat[] = [
  {
    note:
      "3MF: open this in Bambu Studio, OrcaSlicer, or PrusaSlicer. Every part and copy is placed " +
      "on one plate; in Bambu Studio and OrcaSlicer parts are named and assigned one filament " +
      "per colour.",
    files: async (parts, generatorId) => [
      { path: `${sanitizeSegment(generatorId)}.3mf`, data: await partsTo3mf(parts, APP.name) },
    ],
  },
  {
    note:
      "*.stl: one STL per part, for any slicer. Files sharing a prefix (tag-plate.stl, " +
      "tag-text.stl) print together: load them at once and keep their positions. -xN in a name " +
      "means print N copies.",
    // Flat, next to the 3MF: part names are unique, so no numbering or folders are needed. STL
    // has no notion of copies or assemblies, so the name carries both; assembly parts share
    // coordinates, so a slicer lines them up when they are loaded together.
    files: async (parts) =>
      printGroups(parts).flatMap((group) => {
        const copies = group.quantity > 1 ? `-x${group.quantity}` : "";
        return group.parts.map((part) => {
          const stem = group.isAssembly ? `${group.name}-${part.name}` : part.name;
          return {
            path: `${sanitizeSegment(stem)}${copies}.stl`,
            data: meshToBinaryStl(part.mesh, `${APP.name} ${part.name}`),
          };
        });
      }),
  },
];

export type ExportInput = {
  def: GeneratorDef;
  values: Params;
  result: GeneratorResult;
  reproduceUrl: string;
};

/** Every file of an export ZIP: all mesh formats, the generator's extras, and a README. */
export async function exportEntries({
  def,
  values,
  result,
  reproduceUrl,
}: ExportInput): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  const filaments = filamentNumbers(result.parts);
  for (const format of MESH_FORMATS) entries.push(...(await format.files(result.parts, def.id)));
  for (const file of result.extraFiles ?? []) entries.push({ path: file.path, data: file.content });
  entries.push({
    path: "README.txt",
    data: buildReadme({
      appName: APP.name,
      generatorName: def.name,
      params: def.params,
      values,
      parts: result.parts.map((p) => ({
        name: p.assembly ? `${p.assembly}/${p.name}` : p.name,
        quantity: p.quantity ?? 1,
        color: p.color,
        filament: filaments.get(p)!,
      })),
      formatNotes: MESH_FORMATS.map((f) => f.note),
      reproduceUrl,
      files: entries.map((e) => e.path),
      warnings: result.warnings ?? [],
    }),
  });
  return entries;
}

import JSZip from "jszip";
import { printGroups, type PrintGroup } from "../../core/assembly";
import { boundsOf } from "../../core/bounds";
import type { Part } from "../../core/types";

/** Gap between copies laid out along X on the plate. */
const COPY_GAP_MM = 5;

/** Bambu Studio and OrcaSlicer read object and part names and filament numbers from here. */
export const BAMBU_MODEL_SETTINGS = "Metadata/model_settings.config";

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
  '<Default Extension="config" ContentType="text/xml"/>' +
  "</Types>";

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" ' +
  'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
  "</Relationships>";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);

/** Micrometre precision; values below 1e-6 round to 0, so no exponent notation is emitted. */
const num = (value: number) => String(Math.round(value * 1e6) / 1e6 || 0);

/** One placed copy of a print group: a component object referencing the group's part meshes. */
type Placement = { id: number; group: PrintGroup; tx: number; ty: number };

type Layout = {
  /** 3MF object id of each part's mesh object. */
  meshIds: Map<Part, number>;
  placements: Placement[];
  /** Filament (extruder) number per part, 1-based. */
  filaments: Map<Part, number>;
};

/**
 * Filament (extruder) number per part, 1-based: each distinct `color`, in order of first
 * appearance, is the next filament; parts without a colour use filament 1. Mirrors how Bambu
 * Studio maps 3MF colours to filaments, and is written into its per-part settings.
 */
export function filamentNumbers(parts: readonly Part[]): Map<Part, number> {
  const byColour = new Map<string, number>();
  for (const part of parts) {
    const colour = part.color?.toLowerCase();
    if (colour && !byColour.has(colour)) byColour.set(colour, byColour.size + 1);
  }
  return new Map(parts.map((part) => [part, byColour.get(part.color?.toLowerCase() ?? "") ?? 1]));
}

/**
 * Object ids and plate positions. Part meshes get ids 2.. (1 is the material group). Every copy
 * of every print group gets its own component object, so slicers that split multi-instance
 * objects (Bambu Studio does for files from other apps) keep each copy's names and filaments.
 */
function layout(parts: readonly Part[]): Layout {
  const meshIds = new Map(parts.map((part, index) => [part, index + 2]));

  const filaments = filamentNumbers(parts);

  const placements: Placement[] = [];
  let nextId = parts.length + 2;
  let cursor = 0;
  for (const group of printGroups(parts)) {
    const bounds = boundsOf(group.parts.map((p) => p.mesh));
    if (!bounds) continue;
    for (let copy = 0; copy < group.quantity; copy++) {
      placements.push({ id: nextId++, group, tx: cursor - bounds.min[0], ty: -bounds.min[1] });
      cursor += bounds.max[0] - bounds.min[0] + COPY_GAP_MM;
    }
  }
  return { meshIds, placements, filaments };
}

/**
 * 3MF core-spec model XML. Every part is a mesh object; parts with `color` get a base material
 * with that display colour. Each copy of each print group (standalone part or assembly) is a
 * component object placed by one build item, in a row along X; an assembly's components keep
 * their relative positions, so slicers load it as one multi-part object.
 */
export function modelXml(parts: readonly Part[], appName: string): string {
  const { meshIds, placements } = layout(parts);
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" ',
    'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Application">${escapeXml(appName)}</metadata>`,
    "<resources>",
  ];

  const colored = parts.filter((p) => p.color !== undefined);
  if (colored.length > 0) {
    out.push('<basematerials id="1">');
    for (const part of colored) {
      out.push(`<base name="${escapeXml(part.name)}" displaycolor="${part.color}"/>`);
    }
    out.push("</basematerials>");
  }

  for (const part of parts) {
    const material = colored.indexOf(part);
    const pid = material >= 0 ? ` pid="1" pindex="${material}"` : "";
    out.push(
      `<object id="${meshIds.get(part)}" type="model" name="${escapeXml(part.name)}"${pid}>`,
    );
    out.push("<mesh><vertices>");
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      out.push(`<vertex x="${num(p[i])}" y="${num(p[i + 1])}" z="${num(p[i + 2])}"/>`);
    }
    out.push("</vertices><triangles>");
    const t = part.mesh.indices;
    for (let i = 0; i < t.length; i += 3) {
      out.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
    }
    out.push("</triangles></mesh></object>");
  }

  for (const { id, group } of placements) {
    out.push(`<object id="${id}" type="model" name="${escapeXml(group.name)}"><components>`);
    for (const part of group.parts) out.push(`<component objectid="${meshIds.get(part)}"/>`);
    out.push("</components></object>");
  }
  out.push("</resources><build>");
  for (const { id, tx, ty } of placements) {
    out.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${num(tx)} ${num(ty)} 0"/>`);
  }
  out.push("</build></model>");
  return out.join("");
}

/**
 * Bambu Studio / OrcaSlicer per-object settings: the object name, and for every part its name
 * and filament number. Without it Bambu names parts after the object ("tag", "tag_2") and puts
 * every part on filament 1.
 */
export function bambuModelSettingsXml(parts: readonly Part[]): string {
  const { meshIds, placements, filaments } = layout(parts);
  const meta = (key: string, value: string | number) =>
    `<metadata key="${key}" value="${escapeXml(String(value))}"/>`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>'];
  for (const { id, group } of placements) {
    out.push(
      `<object id="${id}">`,
      meta("name", group.name),
      meta("extruder", filaments.get(group.parts[0])!),
    );
    for (const part of group.parts) {
      out.push(
        `<part id="${meshIds.get(part)}" subtype="normal_part">`,
        meta("name", part.name),
        meta("extruder", filaments.get(part)!),
        "</part>",
      );
    }
    out.push("</object>");
  }
  out.push("</config>");
  return out.join("");
}

/** A complete .3mf package (itself a ZIP) holding every part. */
export async function partsTo3mf(parts: readonly Part[], appName: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("3D/3dmodel.model", modelXml(parts, appName));
  zip.file(BAMBU_MODEL_SETTINGS, bambuModelSettingsXml(parts));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

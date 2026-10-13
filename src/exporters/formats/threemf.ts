import JSZip from "jszip";
import { boundsOf } from "../../core/bounds";
import type { Part } from "../../core/types";

/** Gap between copies laid out along X on the plate. */
const COPY_GAP_MM = 5;

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
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

/**
 * 3MF core-spec model XML: one object per part, one build item per copy. Copies are laid out in
 * a row along X; parts with `color` get a base material with that display colour.
 */
export function modelXml(parts: readonly Part[], appName: string): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" ',
    'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Application">${escapeXml(appName)}</metadata>`,
    "<resources>",
  ];

  // Material group id 1; objects start at 2.
  const colored = parts.filter((p) => p.color !== undefined);
  if (colored.length > 0) {
    out.push('<basematerials id="1">');
    for (const part of colored) {
      out.push(`<base name="${escapeXml(part.name)}" displaycolor="${part.color}"/>`);
    }
    out.push("</basematerials>");
  }

  parts.forEach((part, index) => {
    const material = colored.indexOf(part);
    const pid = material >= 0 ? ` pid="1" pindex="${material}"` : "";
    out.push(`<object id="${index + 2}" type="model" name="${escapeXml(part.name)}"${pid}>`);
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
  });
  out.push("</resources><build>");

  let cursor = 0;
  parts.forEach((part, index) => {
    const bounds = boundsOf([part.mesh]);
    if (!bounds) return;
    const width = bounds.max[0] - bounds.min[0];
    for (let copy = 0; copy < (part.quantity ?? 1); copy++) {
      const tx = num(cursor - bounds.min[0]);
      const ty = num(-bounds.min[1]);
      out.push(`<item objectid="${index + 2}" transform="1 0 0 0 1 0 0 0 1 ${tx} ${ty} 0"/>`);
      cursor += width + COPY_GAP_MM;
    }
  });
  out.push("</build></model>");
  return out.join("");
}

/** A complete .3mf package (itself a ZIP) holding every part. */
export async function partsTo3mf(parts: readonly Part[], appName: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("3D/3dmodel.model", modelXml(parts, appName));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

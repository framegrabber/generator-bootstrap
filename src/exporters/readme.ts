import { isVisible } from "../core/params";
import { BUNDLED_FONTS, parseFontRef } from "../fonts/bundled";
import type { ParamSpec, Params } from "../core/types";

export type ReadmeInput = {
  appName: string;
  generatorName: string;
  params: readonly ParamSpec[];
  values: Params;
  parts: readonly { name: string; quantity: number; color?: string; filament: number }[];
  /** One line per mesh format in the ZIP, explaining what it is for. */
  formatNotes: readonly string[];
  reproduceUrl: string;
  files: readonly string[];
  warnings: readonly string[];
};

export function buildReadme(input: ReadmeInput): string {
  const lines: string[] = [`${input.appName} - ${input.generatorName}`, "", "Parameters:"];
  // Hidden params do not affect the geometry, so listing them would only mislead.
  for (const spec of input.params.filter((s) => isVisible(s, input.values))) {
    const unit = spec.kind === "number" && spec.unit ? ` ${spec.unit}` : "";
    lines.push(`  ${spec.label}: ${formatValue(spec, input.values[spec.key])}${unit}`);
  }
  lines.push("", "Parts to print:");
  for (const part of input.parts) {
    const colour = part.color ? `, colour ${part.color}` : "";
    lines.push(`  ${part.name} x ${part.quantity} (filament ${part.filament}${colour})`);
  }
  lines.push("", "Which file to use:");
  for (const note of input.formatNotes) lines.push(`  ${note}`);
  lines.push("", "Reproduce this export:", input.reproduceUrl, "", "Files:");
  for (const file of input.files) lines.push(`  ${file}`);
  if (input.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of input.warnings) lines.push(`  ${warning}`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatValue(spec: ParamSpec, value: Params[string]): string {
  if (spec.kind === "text" && typeof value === "string") return JSON.stringify(value);
  if (spec.kind !== "font" || typeof value !== "string") return String(value);
  const ref = parseFontRef(value);
  if (ref?.kind === "bundled") return `${BUNDLED_FONTS[ref.id].label} (bundled)`;
  // Uploads are identified by content hash; the file name lives only in the uploader's browser.
  return ref ? `uploaded font, SHA-256 ${ref.sha256}` : value;
}

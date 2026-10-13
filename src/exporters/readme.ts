import { isVisible } from "../core/params";
import type { ParamSpec, Params } from "../core/types";

export type ReadmeInput = {
  appName: string;
  generatorName: string;
  params: readonly ParamSpec[];
  values: Params;
  parts: readonly { name: string; quantity: number }[];
  reproduceUrl: string;
  files: readonly string[];
  warnings: readonly string[];
};

export function buildReadme(input: ReadmeInput): string {
  const lines: string[] = [`${input.appName} - ${input.generatorName}`, "", "Parameters:"];
  // Hidden params do not affect the geometry, so listing them would only mislead.
  for (const spec of input.params.filter((s) => isVisible(s, input.values))) {
    const unit = spec.kind === "number" && spec.unit ? ` ${spec.unit}` : "";
    lines.push(`  ${spec.label}: ${String(input.values[spec.key])}${unit}`);
  }
  lines.push("", "Parts to print:");
  for (const part of input.parts) lines.push(`  ${part.name} x ${part.quantity}`);
  lines.push("", "Reproduce this export:", input.reproduceUrl, "", "Files:");
  for (const file of input.files) lines.push(`  ${file}`);
  if (input.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of input.warnings) lines.push(`  ${warning}`);
  }
  lines.push("");
  return lines.join("\n");
}

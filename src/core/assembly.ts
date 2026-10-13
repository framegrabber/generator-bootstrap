import type { Part } from "./types";

/**
 * What the printer sees as one placeable thing: a standalone part, or every part sharing an
 * `assembly` name. Groups are in order of first appearance in `parts`.
 */
export type PrintGroup = {
  /** The assembly name, or the part name for a standalone part. */
  name: string;
  isAssembly: boolean;
  parts: Part[];
  /** Copies of the whole group; checkResult ensures an assembly's parts agree. */
  quantity: number;
};

export function printGroups(parts: readonly Part[]): PrintGroup[] {
  const groups: PrintGroup[] = [];
  const byAssembly = new Map<string, PrintGroup>();
  for (const part of parts) {
    const quantity = part.quantity ?? 1;
    if (part.assembly === undefined) {
      groups.push({ name: part.name, isAssembly: false, parts: [part], quantity });
      continue;
    }
    const existing = byAssembly.get(part.assembly);
    if (existing) {
      existing.parts.push(part);
      continue;
    }
    const group = { name: part.assembly, isAssembly: true, parts: [part], quantity };
    byAssembly.set(part.assembly, group);
    groups.push(group);
  }
  return groups;
}

import JSZip from "jszip";

export type ZipEntry = { path: string; data: string | ArrayBuffer };

/** Bundles entries into one ZIP blob. Duplicate paths are an error, never silently overwritten. */
export async function bundleZip(entries: readonly ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`Duplicate zip entry: ${entry.path}`);
    seen.add(entry.path);
    zip.file(entry.path, entry.data);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

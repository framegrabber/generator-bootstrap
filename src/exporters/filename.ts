/** Reduces a free-form label to a filesystem- and zip-safe segment. */
export function sanitizeSegment(value: string, fallback = "part"): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Local-time stamp, `YYYY-MM-DDTHH-MM-SS` (colons removed for filesystems). */
export function localIsoStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

export function buildZipFilename(slug: string, label: string, date: Date): string {
  return `${sanitizeSegment(slug, "export")}-${sanitizeSegment(label, "export")}-${localIsoStamp(date)}.zip`;
}

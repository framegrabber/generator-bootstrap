/**
 * Fonts shipped with the app, by id. Main-thread safe: the font files themselves are resolved
 * only in the worker (`src/fonts/load.ts`). Adding a font: put the static (not variable) .ttf
 * and its licence in `src/fonts/files/`, add an entry here and a URL in `load.ts`.
 */
export const BUNDLED_FONTS: Record<string, { label: string; license: string }> = {
  inter: { label: "Inter", license: "SIL Open Font License 1.1 (src/fonts/files/Inter-OFL.txt)" },
};

export const DEFAULT_FONT = "bundled:inter";

export type FontRef = { kind: "bundled"; id: string } | { kind: "upload"; sha256: string };

const UPLOAD_REF = /^upload:([0-9a-f]{64})$/;

/** Parses a font param value; null for anything malformed or naming an unknown bundled font. */
export function parseFontRef(value: string): FontRef | null {
  if (value.startsWith("bundled:")) {
    const id = value.slice("bundled:".length);
    return Object.hasOwn(BUNDLED_FONTS, id) ? { kind: "bundled", id } : null;
  }
  const upload = UPLOAD_REF.exec(value);
  return upload ? { kind: "upload", sha256: upload[1] } : null;
}

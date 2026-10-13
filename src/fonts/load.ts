import opentype from "opentype.js";
import interUrl from "./files/Inter-Regular.ttf?url";
import { parseFontRef } from "./bundled";
import { getUploadedFontBytes } from "./library";

/** Asset URLs of the bundled fonts, keyed like BUNDLED_FONTS. Worker-only. */
const BUNDLED_FILES: Record<string, string> = { inter: interUrl };

const cache = new Map<string, Promise<opentype.Font>>();

async function fetchBytes(value: string): Promise<ArrayBuffer> {
  const ref = parseFontRef(value);
  if (!ref) throw new Error(`Unknown font "${value}"`);
  if (ref.kind === "bundled") {
    const response = await fetch(BUNDLED_FILES[ref.id]);
    if (!response.ok) throw new Error(`Could not load the bundled font "${ref.id}"`);
    return response.arrayBuffer();
  }
  const bytes = await getUploadedFontBytes(ref.sha256);
  if (!bytes) {
    throw new Error("The selected uploaded font is not stored in this browser. Upload it again.");
  }
  return bytes;
}

/**
 * Loads and parses the font a `font` param refers to. Call from a generator's build.ts; the
 * parsed font is cached per worker (bundled ids and upload hashes never change their bytes).
 */
export function loadFont(value: string): Promise<opentype.Font> {
  let font = cache.get(value);
  if (!font) {
    font = fetchBytes(value).then((bytes) => {
      try {
        return opentype.parse(bytes);
      } catch (error) {
        throw new Error(
          `Could not read the font: ${error instanceof Error ? error.message : error}`,
          {
            cause: error,
          },
        );
      }
    });
    // A failed load (missing upload, network) is retried next time.
    font.catch(() => cache.delete(value));
    cache.set(value, font);
  }
  return font;
}

import { createStore, del, get, set } from "idb-keyval";
import { APP } from "../app-config";

/**
 * Fonts the user uploaded, stored in this browser's IndexedDB. The main thread writes (upload,
 * remove); the worker reads bytes by hash. Font params reference uploads as `upload:<sha256>`,
 * so a link or settings file using one only works where the font was uploaded.
 */
export type UploadedFont = { sha256: string; name: string; addedAt: number };

const store = createStore(`${APP.slug}-fonts`, "fonts");
const INDEX_KEY = "index";
const bytesKey = (sha256: string) => `font:${sha256}`;

/** Font file signatures opentype.js reads: TrueType, OpenType/CFF, Apple TrueType, WOFF. */
const SIGNATURES = [0x00010000, 0x4f54544f, 0x74727565, 0x774f4646];

export async function listUploadedFonts(): Promise<UploadedFont[]> {
  return (await get<UploadedFont[]>(INDEX_KEY, store)) ?? [];
}

export async function getUploadedFontBytes(sha256: string): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(bytesKey(sha256), store);
}

/** Stores a font file and returns its entry; uploading the same bytes again reuses it. */
export async function addUploadedFont(name: string, bytes: ArrayBuffer): Promise<UploadedFont> {
  if (bytes.byteLength < 4 || !SIGNATURES.includes(new DataView(bytes).getUint32(0))) {
    throw new Error(`"${name}" is not a TTF, OTF, or WOFF font file`);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const fonts = await listUploadedFonts();
  const existing = fonts.find((f) => f.sha256 === sha256);
  if (existing) return existing;
  const entry: UploadedFont = { sha256, name, addedAt: Date.now() };
  await set(bytesKey(sha256), bytes, store);
  await set(INDEX_KEY, [...fonts, entry], store);
  return entry;
}

export async function removeUploadedFont(sha256: string): Promise<void> {
  await del(bytesKey(sha256), store);
  const rest = (await listUploadedFonts()).filter((f) => f.sha256 !== sha256);
  await set(INDEX_KEY, rest, store);
}

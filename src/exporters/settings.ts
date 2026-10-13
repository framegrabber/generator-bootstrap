import { APP } from "../app-config";
import { findGenerator } from "../generators";
import { isRecord, restoreSnapshot, type Snapshot } from "../state/snapshot";

export const SETTINGS_VERSION = 1;

export function settingsJson(snapshot: Snapshot): string {
  return JSON.stringify(
    {
      app: APP.slug,
      version: SETTINGS_VERSION,
      generator: snapshot.generator,
      values: snapshot.values,
    },
    null,
    2,
  );
}

/** Parses a settings file written by settingsJson. Throws on anything foreign or unknown. */
export function parseSettingsFile(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Settings file is not valid JSON");
  }
  if (!isRecord(raw) || raw.app !== APP.slug || typeof raw.generator !== "string") {
    throw new Error("Not a settings file for this app");
  }
  if (!findGenerator(raw.generator)) {
    throw new Error(`Settings file uses unknown generator "${raw.generator}"`);
  }
  return restoreSnapshot(raw);
}

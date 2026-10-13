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

/**
 * Parses a settings file written by settingsJson. Throws on anything foreign, unknown, or newer
 * than this app understands; older generator values go through the generator's `migrate`.
 */
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
  const { version } = raw;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("Settings file has no valid version");
  }
  if (version > SETTINGS_VERSION) {
    throw new Error(
      `Settings file is version ${version}; this app reads up to version ${SETTINGS_VERSION}`,
    );
  }
  if (!findGenerator(raw.generator)) {
    throw new Error(`Settings file uses unknown generator "${raw.generator}"`);
  }
  return restoreSnapshot(raw);
}

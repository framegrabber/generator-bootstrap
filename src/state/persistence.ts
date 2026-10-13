import { APP } from "../app-config";
import { useParams } from "./params-store";
import { restoreSnapshot, type Snapshot } from "./snapshot";

const URL_KEY = "p";
const STORAGE_KEY = `${APP.slug}-params-v1`;

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Absolute URL that reproduces `snapshot` when opened. */
export function snapshotUrl(snapshot: Snapshot): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(URL_KEY, JSON.stringify(snapshot));
  return url.toString();
}

/**
 * Restores state before first render (URL wins over localStorage), then mirrors every
 * params change back to both. Call once from main.tsx.
 */
export function initPersistence(): void {
  const fromUrl = parseJson(new URLSearchParams(window.location.search).get(URL_KEY));
  const fromStorage = parseJson(window.localStorage.getItem(STORAGE_KEY));
  useParams.getState().replace(restoreSnapshot(fromUrl ?? fromStorage));

  useParams.subscribe((state) => {
    const snapshot: Snapshot = { generator: state.generatorId, values: state.values };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.history.replaceState(null, "", snapshotUrl(snapshot));
  });
}

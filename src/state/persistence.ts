import { APP } from "../app-config";
import { useParams } from "./params-store";
import { restoreSnapshot, type Snapshot } from "./snapshot";

const URL_KEY = "p";
const STORAGE_KEY = `${APP.slug}-params-v1`;
const WRITE_DELAY_MS = 300;

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Storage access throws when the browser blocks it (privacy modes, sandboxed frames). */
function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Absolute URL that reproduces `snapshot` when opened. */
export function snapshotUrl(snapshot: Snapshot): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(URL_KEY, JSON.stringify(snapshot));
  return url.toString();
}

/**
 * Restores state before first render (URL wins over localStorage), then mirrors params changes
 * back to both. Writes are debounced: Safari throws when replaceState runs ~100 times in a
 * short window, and every keystroke changes params. Persistence is best-effort, so a write
 * failure is logged and never breaks editing. Call once from main.tsx; returns a stop function.
 */
export function initPersistence(): () => void {
  const fromUrl = parseJson(new URLSearchParams(window.location.search).get(URL_KEY));
  useParams.getState().replace(restoreSnapshot(fromUrl ?? parseJson(readStorage())));

  let timer: number | undefined;
  const write = () => {
    window.clearTimeout(timer);
    timer = undefined;
    const { generatorId, values } = useParams.getState();
    const snapshot: Snapshot = { generator: generatorId, values };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Could not save parameters to localStorage", error);
    }
    try {
      window.history.replaceState(null, "", snapshotUrl(snapshot));
    } catch (error) {
      console.warn("Could not update the URL", error);
    }
  };

  const unsubscribe = useParams.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(write, WRITE_DELAY_MS);
  });
  // Flush a pending write when the tab goes away so the last edit survives a reload.
  const flush = () => {
    if (timer !== undefined) write();
  };
  window.addEventListener("pagehide", flush);
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
    window.removeEventListener("pagehide", flush);
  };
}

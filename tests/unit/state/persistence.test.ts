import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP } from "../../../src/app-config";
import { initPersistence } from "../../../src/state/persistence";
import { useParams } from "../../../src/state/params-store";
import { defaultSnapshot } from "../../../src/state/snapshot";

const STORAGE_KEY = `${APP.slug}-params-v1`;

function stubWindow(search: string, storage: Partial<Storage>) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { search, origin: "https://example.test", pathname: "/" },
    localStorage: storage,
    history: { replaceState },
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return { replaceState };
}

function urlFor(width: number): string {
  const snapshot = { generator: "rounded-tag", values: { ...defaultSnapshot().values, width } };
  return `?p=${encodeURIComponent(JSON.stringify(snapshot))}`;
}

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  useParams.getState().replace(defaultSnapshot());
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("initPersistence", () => {
  it("prefers the URL snapshot over localStorage", () => {
    const stored = JSON.stringify({ generator: "rounded-tag", values: { width: 11 } });
    stubWindow(urlFor(77), { getItem: () => stored, setItem: vi.fn() });
    stop = initPersistence();
    expect(useParams.getState().values.width).toBe(77);
  });

  it("starts from defaults when storage access throws", () => {
    stubWindow("", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    stop = initPersistence();
    expect(useParams.getState().values).toEqual(defaultSnapshot().values);
  });

  it("writes once after a burst of edits and still updates the URL when storage fails", async () => {
    const setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    const { replaceState } = stubWindow("", { getItem: () => null, setItem });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stop = initPersistence();

    for (let width = 41; width < 60; width++) useParams.getState().setValue("width", width);
    await vi.advanceTimersByTimeAsync(1000);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"width":59'));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(useParams.getState().values.width).toBe(59);
  });
});

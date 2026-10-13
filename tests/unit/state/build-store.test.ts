import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildFn } from "../../../src/build/worker-client";
import type { GeneratorResult, Params } from "../../../src/core/types";
import { canExport, startBuildSync, useBuild } from "../../../src/state/build-store";
import { useParams } from "../../../src/state/params-store";
import { defaultSnapshot } from "../../../src/state/snapshot";

type Call = {
  params: Params;
  resolve: (result: GeneratorResult) => void;
  reject: (error: Error) => void;
};

const DEBOUNCE = 150;
const initialBuildState = useBuild.getState();
let calls: Call[];
let stop: () => void;

const fakeBuild: BuildFn = (_id, params) => {
  const { promise, resolve, reject } = Promise.withResolvers<GeneratorResult>();
  calls.push({ params, resolve, reject });
  return promise;
};

function resultTagged(tag: string): GeneratorResult {
  return { parts: [], warnings: [tag] };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  useParams.getState().replace(defaultSnapshot());
  useBuild.setState(initialBuildState, true);
  stop = startBuildSync(fakeBuild, DEBOUNCE);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("startBuildSync", () => {
  it("builds once per debounce window, with the last params", async () => {
    useParams.getState().setValue("width", 50);
    useParams.getState().setValue("width", 60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls.map((c) => c.params.width)).toEqual([60]);
  });

  it("ignores an older build that resolves after a newer one", async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    useParams.getState().setValue("width", 60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls).toHaveLength(2);

    calls[1].resolve(resultTagged("new"));
    await settle();
    calls[0].resolve(resultTagged("old"));
    await settle();

    expect(useBuild.getState().result?.warnings).toEqual(["new"]);
    expect(canExport(useBuild.getState())).toBe(true);
  });

  it("drops an older build's result even when it lands first", async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    useParams.getState().setValue("width", 60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    calls[0].resolve(resultTagged("old"));
    await settle();
    expect(useBuild.getState().result).toBeNull();
    expect(useBuild.getState().busy).toBe(true);
  });

  it("blocks export while the shown result belongs to other params", async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    calls[0].resolve(resultTagged("first"));
    await settle();
    expect(canExport(useBuild.getState())).toBe(true);

    useParams.getState().setValue("width", 70);
    expect(canExport(useBuild.getState())).toBe(false);
  });

  it("does not build invalid params and cancels a pending valid build", async () => {
    useParams.getState().setValue("width", 50);
    useParams.getState().setValue("width", -1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls).toEqual([]);
    expect(useBuild.getState().issues.map((i) => i.key)).toContain("width");
  });

  it("reports the newest build's error and keeps the previous geometry", async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    calls[0].resolve(resultTagged("good"));
    await settle();
    useParams.getState().setValue("width", 70);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    calls[1].reject(new Error("boom"));
    await settle();

    const state = useBuild.getState();
    expect(state.error).toBe("boom");
    expect(state.result?.warnings).toEqual(["good"]);
    expect(canExport(state)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  createBuildClient,
  SupersededError,
  type BuildWorker,
} from "../../../src/build/worker-client";
import type { BuildRequest, BuildResponse } from "../../../src/core/protocol";

class FakeWorker implements BuildWorker {
  onmessage: BuildWorker["onmessage"] = null;
  onerror: BuildWorker["onerror"] = null;
  posted: BuildRequest[] = [];
  terminated = false;

  postMessage(request: BuildRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: BuildResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<BuildResponse>);
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const build = createBuildClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { build, workers };
}

describe("createBuildClient", () => {
  it("keeps one build in flight and replaces the waiting one with newer requests", async () => {
    const { build, workers } = setup();
    const first = build("g", { n: 1 });
    const second = build("g", { n: 2 });
    const third = build("g", { n: 3 });

    await expect(second).rejects.toBeInstanceOf(SupersededError);
    expect(workers[0].posted.map((r) => r.params.n)).toEqual([1]);

    workers[0].reply({ requestId: workers[0].posted[0].requestId, ok: true, result: { parts: [] } });
    await expect(first).resolves.toEqual({ parts: [] });
    expect(workers[0].posted.map((r) => r.params.n)).toEqual([1, 3]);

    workers[0].reply({ requestId: workers[0].posted[1].requestId, ok: false, error: "bad" });
    await expect(third).rejects.toThrow("bad");
  });

  it("fails the in-flight build on a crash and runs the waiting one on a fresh worker", async () => {
    const { build, workers } = setup();
    const first = build("g", { n: 1 });
    const second = build("g", { n: 2 });

    workers[0].crash("out of memory");
    await expect(first).rejects.toThrow("out of memory");
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((r) => r.params.n)).toEqual([2]);

    workers[1].reply({ requestId: workers[1].posted[0].requestId, ok: true, result: { parts: [] } });
    await expect(second).resolves.toEqual({ parts: [] });
  });
});

import type { BuildRequest, BuildResponse } from "../core/protocol";
import type { GeneratorResult, Params } from "../core/types";

/** The slice of `Worker` the client uses, so tests can drive it with a fake. */
export type BuildWorker = {
  onmessage: ((event: MessageEvent<BuildResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: BuildRequest): void;
  terminate(): void;
};

/** Rejection for a queued request that a newer one replaced before it reached the worker. */
export class SupersededError extends Error {
  constructor() {
    super("Build superseded by a newer request");
    this.name = "SupersededError";
  }
}

type Job = {
  request: BuildRequest;
  resolve: (result: GeneratorResult) => void;
  reject: (error: Error) => void;
};

export type BuildFn = (generatorId: string, params: Params) => Promise<GeneratorResult>;

/**
 * Worker builds cannot be cancelled, so the client keeps at most one build in flight and one
 * waiting. A newer request replaces the waiting one, so stale parameter sets are never built.
 */
export function createBuildClient(createWorker: () => BuildWorker): BuildFn {
  let worker: BuildWorker | null = null;
  let nextRequestId = 1;
  let inFlight: Job | null = null;
  let waiting: Job | null = null;

  function dispatch(job: Job): void {
    inFlight = job;
    ensureWorker().postMessage(job.request);
  }

  function dispatchWaiting(): void {
    const next = waiting;
    waiting = null;
    if (next) dispatch(next);
  }

  function ensureWorker(): BuildWorker {
    if (worker) return worker;
    const created = createWorker();
    created.onmessage = (event) => {
      const response = event.data;
      const job = inFlight;
      if (!job || job.request.requestId !== response.requestId) return;
      inFlight = null;
      if (response.ok) job.resolve(response.result);
      else job.reject(new Error(response.error));
      dispatchWaiting();
    };
    created.onerror = (event) => {
      // A crashed worker fails the in-flight build; the waiting one runs on a fresh worker.
      created.terminate();
      worker = null;
      const job = inFlight;
      inFlight = null;
      job?.reject(new Error(event.message || "Build worker crashed"));
      dispatchWaiting();
    };
    worker = created;
    return created;
  }

  return (generatorId, params) => {
    const { promise, resolve, reject } = Promise.withResolvers<GeneratorResult>();
    const job: Job = { request: { requestId: nextRequestId++, generatorId, params }, resolve, reject };
    if (!inFlight) {
      dispatch(job);
    } else {
      waiting?.reject(new SupersededError());
      waiting = job;
    }
    return promise;
  };
}

export const buildGenerator: BuildFn = createBuildClient(
  () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as BuildWorker,
);

import type { BuildRequest, BuildResponse } from "../core/protocol";
import type { GeneratorResult, Params } from "../core/types";

type Pending = {
  resolve: (result: GeneratorResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<BuildResponse>) => {
    const response = event.data;
    const entry = pending.get(response.requestId);
    if (!entry) return;
    pending.delete(response.requestId);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  };
  created.onerror = (event: ErrorEvent) => {
    // A crashed worker rejects everything in flight; the next build starts a fresh one.
    const error = new Error(event.message || "Build worker crashed");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    created.terminate();
    worker = null;
  };
  worker = created;
  return created;
}

export function buildGenerator(generatorId: string, params: Params): Promise<GeneratorResult> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    const request: BuildRequest = { requestId, generatorId, params };
    ensureWorker().postMessage(request);
  });
}

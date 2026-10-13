import { errorMessage, type BuildRequest, type BuildResponse } from "../core/protocol";
import type { GeneratorResult } from "../core/types";
import { runBuild } from "./run";

type WorkerScope = {
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
  postMessage(message: BuildResponse, transfer: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = async ({ data: request }) => {
  try {
    const result = await runBuild(request.generatorId, request.params);
    scope.postMessage({ requestId: request.requestId, ok: true, result }, transferablesOf(result));
  } catch (error) {
    scope.postMessage({ requestId: request.requestId, ok: false, error: errorMessage(error) }, []);
  }
};

/** Each buffer once: listing a shared buffer twice makes postMessage throw DataCloneError. */
function transferablesOf(result: GeneratorResult): Transferable[] {
  const buffers = new Set<ArrayBufferLike>();
  for (const { mesh } of result.parts) buffers.add(mesh.positions.buffer).add(mesh.indices.buffer);
  return [...buffers] as ArrayBuffer[];
}

import { findGenerator } from "../generators";
import { getManifold } from "../core/manifold";
import { validateParams } from "../core/params";
import { errorMessage, type BuildRequest, type BuildResponse } from "../core/protocol";
import type { GeneratorResult } from "../core/types";

type WorkerScope = {
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
  postMessage(message: BuildResponse, transfer: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  void handle(event.data);
};

async function handle(request: BuildRequest): Promise<void> {
  try {
    const def = findGenerator(request.generatorId);
    if (!def) throw new Error(`Unknown generator "${request.generatorId}"`);
    const issues = validateParams(def, request.params);
    if (issues.length > 0) throw new Error(issues.map((i) => i.message).join("; "));

    const wasm = await getManifold();
    const result = await def.build(request.params, { wasm });
    scope.postMessage(
      { requestId: request.requestId, ok: true, result },
      transferablesOf(result),
    );
  } catch (error) {
    scope.postMessage(
      { requestId: request.requestId, ok: false, error: errorMessage(error) },
      [],
    );
  }
}

function transferablesOf(result: GeneratorResult): Transferable[] {
  const list: Transferable[] = [];
  for (const part of result.parts) {
    list.push(part.mesh.positions.buffer as ArrayBuffer, part.mesh.indices.buffer as ArrayBuffer);
  }
  return list;
}

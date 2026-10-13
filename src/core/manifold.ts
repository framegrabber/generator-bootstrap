import Module from "manifold-3d";
import type { ManifoldLib, Mesh } from "./types";

let cached: Promise<ManifoldLib> | null = null;

/** Loads the WASM module once per worker. A failed load is retried on the next call. */
export function getManifold(): Promise<ManifoldLib> {
  cached ??= Module()
    .then((m) => {
      m.setup();
      return m;
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

type Disposable = { delete(): void };

/**
 * Collects every WASM object a build creates, including intermediates, and deletes them all
 * on exit. Manifold/CrossSection objects are not garbage-collected.
 */
export class WasmScope {
  readonly #items: Disposable[] = [];

  track<T extends Disposable>(item: T): T {
    this.#items.push(item);
    return item;
  }

  dispose(): void {
    while (this.#items.length > 0) this.#items.pop()?.delete();
  }
}

export function withScope<T>(fn: (scope: WasmScope) => T): T {
  const scope = new WasmScope();
  try {
    return fn(scope);
  } finally {
    scope.dispose();
  }
}

type MeshSource = {
  getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
};

/**
 * Copies a Manifold into a plain xyz mesh. getMesh() returns views into the WASM heap, so
 * the copy must happen before the source is deleted. Extra vertex properties are dropped.
 */
export function meshFromManifold(source: MeshSource): Mesh {
  const raw = source.getMesh();
  const stride = raw.numProp;
  if (stride < 3) throw new Error(`Manifold mesh has ${stride} properties per vertex; need >= 3`);
  const vertexCount = raw.vertProperties.length / stride;
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const src = i * stride;
    const dst = i * 3;
    positions[dst] = raw.vertProperties[src];
    positions[dst + 1] = raw.vertProperties[src + 1];
    positions[dst + 2] = raw.vertProperties[src + 2];
  }
  return { positions, indices: raw.triVerts.slice() };
}

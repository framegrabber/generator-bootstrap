import { describe, expect, it, vi } from "vitest";
import { meshFromManifold, withScope } from "../../../src/core/manifold";

function disposable() {
  return { delete: vi.fn() };
}

describe("withScope", () => {
  it("deletes every tracked object, in reverse order, when the body returns", () => {
    const a = disposable();
    const b = disposable();
    withScope((scope) => {
      scope.track(a);
      scope.track(b);
    });
    expect(a.delete).toHaveBeenCalledTimes(1);
    expect(b.delete).toHaveBeenCalledTimes(1);
  });

  it("still deletes tracked objects when the body throws", () => {
    const a = disposable();
    expect(() =>
      withScope((scope) => {
        scope.track(a);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
});

describe("meshFromManifold", () => {
  it("keeps only xyz from interleaved vertex properties and copies the indices", () => {
    const source = {
      getMesh: () => ({
        numProp: 5,
        vertProperties: new Float32Array([1, 2, 3, 9, 9, 4, 5, 6, 9, 9]),
        triVerts: new Uint32Array([0, 1, 1]),
      }),
    };
    const mesh = meshFromManifold(source);
    expect(Array.from(mesh.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 1]);
  });

  it("does not alias the WASM heap view", () => {
    const heap = new Uint32Array([0, 1, 2]);
    const mesh = meshFromManifold({
      getMesh: () => ({
        numProp: 3,
        vertProperties: new Float32Array(9),
        triVerts: heap,
      }),
    });
    heap[0] = 99;
    expect(mesh.indices[0]).toBe(0);
  });

  it("rejects meshes with fewer than three properties per vertex", () => {
    expect(() =>
      meshFromManifold({
        getMesh: () => ({
          numProp: 2,
          vertProperties: new Float32Array(4),
          triVerts: new Uint32Array(0),
        }),
      }),
    ).toThrow(/need >= 3/);
  });
});

import type { Mesh } from "../../core/types";

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

/** Binary STL: 80-byte header, uint32 triangle count, then per triangle normal + 3 verts + attr. */
export function meshToBinaryStl(mesh: Mesh, header = "binary STL"): ArrayBuffer {
  if (mesh.indices.length % 3 !== 0) throw new Error("Mesh index count must be a multiple of 3");
  const triangleCount = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + triangleCount * TRIANGLE_BYTES);
  const view = new DataView(buffer);

  const headerBytes = new TextEncoder().encode(header).subarray(0, HEADER_BYTES - 1);
  new Uint8Array(buffer, 0, HEADER_BYTES).set(headerBytes);
  view.setUint32(HEADER_BYTES, triangleCount, true);

  const p = mesh.positions;
  const idx = mesh.indices;
  let offset = HEADER_BYTES + 4;
  const writeVec = (x: number, y: number, z: number) => {
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    offset += 12;
  };
  for (let t = 0; t < triangleCount; t++) {
    const a = idx[t * 3] * 3;
    const b = idx[t * 3 + 1] * 3;
    const c = idx[t * 3 + 2] * 3;

    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;

    writeVec(nx / length, ny / length, nz / length);
    writeVec(p[a], p[a + 1], p[a + 2]);
    writeVec(p[b], p[b + 1], p[b + 2]);
    writeVec(p[c], p[c + 1], p[c + 2]);
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

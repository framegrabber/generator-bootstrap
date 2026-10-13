import * as THREE from "three";
import type { Mesh } from "../core/types";

/**
 * Builds a flat-shaded geometry (one vertex set per triangle) so 90-degree creases stay
 * crisp. Smooth shading would round every corner.
 */
export function meshToGeometry(mesh: Mesh): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  const flat = indexed.toNonIndexed();
  indexed.dispose();
  flat.computeVertexNormals();
  return flat;
}

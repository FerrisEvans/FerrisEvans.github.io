import { Group, Matrix4, Mesh, Object3D, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch only static baked surfaces. Keep dynamic screens and hierarchy transforms intact. */
export function batchRoom(root: Object3D, resources: Set<{ dispose(): void }>) {
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: Material; meshes: Mesh[] }>();
  root.traverse(object => {
    if (!(object instanceof Mesh) || !object.visible || object.userData.roomDynamic || (!object.userData.atlas && object.userData.surface_role !== 'print') || Array.isArray(object.material)) return;
    const signature = Object.entries((object.geometry as BufferGeometry).attributes).map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}`).sort().join(',');
    const key = object.material.uuid + ':' + signature + ':' + Boolean(object.geometry.index);
    if (!groups.has(key)) groups.set(key, { material: object.material, meshes: [] });
    groups.get(key)!.meshes.push(object);
  });
  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const copies: BufferGeometry[] = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    const geometry = mergeGeometries(copies, false);
    copies.forEach(copy => copy.dispose());
    if (!geometry) throw new Error('Static geometry batching failed');
    resources.add(geometry);
    const merged = new Mesh(geometry, material); merged.name = 'Static_' + material.name;
    for (const mesh of meshes) {
      // A printed child may be parented to a baked case: retain its exact local frame.
      const group = new Group(); group.name = mesh.name; group.userData = mesh.userData;
      group.position.copy(mesh.position); group.quaternion.copy(mesh.quaternion); group.scale.copy(mesh.scale);
      mesh.parent?.add(group);
      while (mesh.children.length) group.add(mesh.children[0]);
      mesh.removeFromParent();
      resources.delete(mesh.geometry); mesh.geometry.dispose();
    }
    root.add(merged);
  }
  root.updateMatrixWorld(true);
}

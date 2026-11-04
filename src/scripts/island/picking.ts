import { Mesh, Object3D, Raycaster, Vector2, type Camera } from 'three';
import { hoverObjects, type HoverTarget } from './types';

export function createPicker(root: Object3D, camera: Camera, host: HTMLElement) {
  const ray = new Raycaster(), pointer = new Vector2();
  const groups = new Map(Object.entries(hoverObjects).map(([target, name]) => [name, target as HoverTarget]));
  function pick(x: number, y: number): HoverTarget | null {
    const rect = host.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    // Only the nearest visible mesh wins, so a tree cannot click through a house.
    const hit = ray.intersectObject(root, true).find(hit => {
      let node: Object3D | null = hit.object;
      while (node) { if (!node.visible) return false; node = node.parent; }
      return hit.object instanceof Mesh;
    });
    for (let node: Object3D | null = hit?.object ?? null; node; node = node.parent) {
      if (groups.has(node.name)) return groups.get(node.name)!;
    }
    return null;
  }
  return { pick };
}

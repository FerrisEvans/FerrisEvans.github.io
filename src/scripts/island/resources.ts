import { Mesh, Texture, type Material, type Object3D } from 'three';

/** Materials do not own texture disposal in Three. Imported maps and decoded
 * images must be released explicitly, once, even when several props share them. */
export function releaseObjectResources(root: Object3D, retainedMaterials: Iterable<Material> = []) {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set(retainedMaterials);
  const textures = new Set<Texture>();
  const images = new Set<{ close?: () => void }>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
  }
  for (const texture of textures) {
    const data = texture.source.data;
    for (const image of Array.isArray(data) ? data : [data]) if (image) images.add(image);
    texture.dispose();
  }
  images.forEach(image => image.close?.());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

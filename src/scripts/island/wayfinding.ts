import {
  CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, Shape, SRGBColorSpace, Vector3, type Object3D,
} from 'three';
import { viewObjects } from './types';
import bookIcon from 'naive-icons/svg/book.svg?raw';
import gridIcon from 'naive-icons/svg/grid.svg?raw';
import tagIcon from 'naive-icons/svg/tag.svg?raw';

/** Small, physical signs share their prop's picking/outline ownership. They are
 * world geometry, including their backs, so trees occlude them naturally. */
export async function createWayfinding(root: Object3D, signal: AbortSignal) {
  // Reuse the exact SVGs used by the navigation. Their geometry is independent
  // of language and does not wait for a web font before the island can open.
  const icons = await Promise.all([bookIcon, gridIcon, tagIcon].map(async svg => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg width="256" height="256" '))}`;
    await image.decode();
    return image;
  }));
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const wood = new MeshStandardMaterial({ color: '#b88d62', roughness: .94 });
  const cord = new MeshStandardMaterial({ color: '#8c7251', roughness: 1 });
  const plaques: Group[] = [];
  const specs = [
    { view: 'library', icon: 0, kind: 'paper', x: -1.87, y: 2.60, z: -1.55, width: .66, height: .62, yaw: .28 },
    { view: 'categories', icon: 1, kind: 'arrow', x: 1.45, y: 1.23, z: 2.18, width: .70, height: .59, yaw: .54 },
    { view: 'tags', icon: 2, kind: 'plant', x: 3.57, y: 1.40, z: -.02, width: .64, height: .60, yaw: .40 },
  ] as const;
  function rod(parent: Object3D, start: Vector3, end: Vector3, radius: number, material: MeshStandardMaterial) {
    const delta = end.clone().sub(start);
    const mesh = new Mesh(new CylinderGeometry(radius, radius, delta.length(), 8), material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true; parent.add(mesh);
  }
  for (const spec of specs) {
    const owner = root.getObjectByName(viewObjects[spec.view]);
    if (!owner) continue;
    const group = new Group(); group.name = `Wayfinding_${spec.view}`;
    owner.add(group); root.updateWorldMatrix(true, true);
    group.position.copy(owner.worldToLocal(new Vector3(spec.x, spec.y, spec.z)));
    group.rotation.y = spec.yaw;
    const plaque = new Group(); group.add(plaque); plaques.push(plaque);
    const { width: w, height: h } = spec;
    const shape = new Shape(), r = .07;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    if (spec.kind === 'arrow') {
      shape.lineTo(w / 2 + .13, 0); shape.lineTo(w / 2 - r, h / 2);
    } else {
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    }
    shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const material = new MeshStandardMaterial({ color: spec.kind === 'paper' ? '#fff2d1' : spec.kind === 'plant' ? '#dce5ba' : '#e2be88', roughness: 1 });
    const board = new Mesh(new ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelSize: .015, bevelThickness: .012, bevelSegments: 2, steps: 1, curveSegments: 5 }), material);
    board.castShadow = true; board.receiveShadow = true; plaque.add(board);
    if (spec.kind === 'paper') {
      group.updateWorldMatrix(true, false);
      for (const x of [-w * .3, w * .3]) rod(group, new Vector3(x, h / 2 - .04, 0), group.worldToLocal(new Vector3(spec.x + x, 3.08, -1.96)), .012, cord);
    } else {
      rod(group, new Vector3(0, .45 - spec.y, -.055), new Vector3(0, h / 2 - .05, -.055), .045, wood);
    }
    // A square texture on a square face preserves the original icon geometry
    // as the wooden boards shrink from word labels to compact symbols.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(icons[spec.icon], 40, 40, 432, 432);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    const ink = new MeshStandardMaterial({ map, transparent: true, roughness: 1, depthWrite: false });
    for (const back of [false, true]) {
      const iconSize = Math.min(w * .8, h * .82);
      const face = new Mesh(new PlaneGeometry(iconSize, iconSize), ink);
      face.position.z = back ? -.014 : .049;
      if (back) face.rotation.y = Math.PI;
      plaque.add(face);
    }
  }
  return {
    resize(width: number) {
      // Keep the three entrance symbols readable on a narrow screen. Supports keep
      // their ground/shelf contacts; only the signs themselves grow slightly.
      const scale = 1 + Math.max(0, Math.min(.55, (700 - width) / 500));
      plaques.forEach(plaque => plaque.scale.setScalar(scale));
    },
  };
}

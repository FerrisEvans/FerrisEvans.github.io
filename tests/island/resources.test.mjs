import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { releaseObjectResources } from '../../src/scripts/island/resources.ts';

test('shared imported maps, decoded images and cloned source materials are released once', () => {
  const released = { geometry: 0, source: 0, clone: 0, texture: 0, image: 0 };
  const texture = new Texture({ close() { released.image++; } });
  const source = new MeshStandardMaterial({ map: texture, emissiveMap: texture });
  const clone = source.clone();
  const geometry = new BoxGeometry();
  for (const [object, key] of [[texture, 'texture'], [source, 'source'], [clone, 'clone'], [geometry, 'geometry']]) {
    object.addEventListener('dispose', () => released[key]++);
  }
  const root = new Group();
  root.add(new Mesh(geometry, clone), new Mesh(geometry, [clone, source]));
  releaseObjectResources(root, [source]);
  assert.deepEqual(released, { geometry: 1, source: 1, clone: 1, texture: 1, image: 1 });
});

test('an unattached late glTF result can release ordinary image textures without a renderer', () => {
  const texture = new Texture({ width: 256, height: 256 });
  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; });
  releaseObjectResources(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture })));
  assert(disposed);
});

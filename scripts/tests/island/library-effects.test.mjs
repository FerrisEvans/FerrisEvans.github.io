import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Group, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { loadTS } from './load-typescript.mjs';

const { createEffects } = loadTS(resolve('src/scripts/island/effects.ts'));

test('the actual feature book clears its shelf throughout hover, release and reduced motion', async t => {
  const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(resolve('public/island/island.glb'));
  const source = document.getRoot().listNodes().find(node => node.getName() === 'Library_FeatureBook');
  assert(source, 'the independently moving book pivot survives export');
  const pivotWorld = new Matrix4().fromArray(source.getWorldMatrix());
  const pivotInverse = pivotWorld.clone().invert();
  const vertices = [];
  source.traverse(node => {
    if (!node.getMesh()) return;
    const matrix = pivotInverse.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      for (let i = 0; i < positions.getCount(); i++) {
        vertices.push(new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(matrix));
      }
    }
  });
  assert(vertices.length > 0, 'clearance uses exported book vertices, not an invented box');
  const scene = new Scene(), root = new Group(), book = new Group();
  book.name = 'Library_FeatureBook';
  pivotWorld.decompose(book.position, book.quaternion, book.scale);
  root.add(book); scene.add(root);
  const original = book.position.clone();
  const originalRotation = book.rotation.z;
  const bottom = () => {
    root.updateMatrixWorld(true);
    return Math.min(...vertices.map(point => point.clone().applyMatrix4(book.matrixWorld).y));
  };
  // The authoring script seats the book 2 mm above its actual bearing surface.
  // Test the runtime motion independently of that shelf's absolute elevation.
  const bearingY = bottom() - .002;
  const effects = createEffects(root, scene, new PerspectiveCamera());
  const assertClear = () => assert(bottom() >= bearingY + .0019, 'the tilting bottom corner must stay above the shelf');
  t.after(() => {
    const resources = new Set();
    scene.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material) resources.add(material);
      }
    });
    for (const resource of resources) resource.dispose();
  });
  assertClear();
  for (const target of ['library', null]) {
    effects.hover(target);
    for (let frame = 0; frame < 180; frame++) {
      effects.update(frame / 60, 1 / 60, false); assertClear();
    }
  }
  effects.hover('library'); effects.update(0, 0, true); assertClear();
  assert(Math.abs(book.position.z - original.z - .16) < 1e-6, 'the original full pull remains available');
  effects.hover(null); effects.update(0, 0, true); assertClear();
  assert(book.position.distanceTo(original) < 1e-9, 'release restores the exact authored rest position');
  assert(Math.abs(book.rotation.z - originalRotation) < 1e-9);
});

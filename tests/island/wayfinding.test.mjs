import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { loadTS } from './load-typescript.mjs';

const require = createRequire(import.meta.url);
const { Group } = THREE;

// Only browser image decoding and canvas are supplied below; Three creates
// the real geometry from the production renderer.
const { createWayfinding } = loadTS(resolve('src/scripts/island/wayfinding.ts'));

function fixture(t, decode = () => Promise.resolve()) {
  const previous = { Image: globalThis.Image, document: globalThis.document };
  const draws = [];
  globalThis.Image = class {
    src = '';
    decode() { return decode(); }
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0, image: null, getContext(kind) {
        assert.equal(kind, '2d');
        return {
          drawImage(image, x, y, width, height) {
            assert(x >= 0 && y >= 0 && x + width <= canvas.width && y + height <= canvas.height);
            canvas.image = image; draws.push(image);
          },
          fillText() { assert.fail('Physical signs must not depend on translated text or fonts'); },
        };
      } };
      return canvas;
    },
  };
  const root = new Group();
  for (const name of ['Library', 'Categories', 'Tags', 'Dog', 'Bear', 'Rabbit']) {
    const owner = new Group(); owner.name = name; root.add(owner);
  }
  t.after(() => {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material); if (material.map) textures.add(material.map);
      }
    });
    for (const resource of [...textures, ...materials, ...geometries]) resource.dispose();
  });
  return { root, draws };
}

test('language-neutral signs retain their physical owners and use the same icons as navigation', async t => {
  const { root, draws } = fixture(t);
  const signs = await createWayfinding(root, new AbortController().signal);
  assert.equal(draws.length, 3);
  for (const [view, owner, icon] of [['library', 'Library', 'book'], ['categories', 'Categories', 'grid'], ['tags', 'Tags', 'tag']]) {
    const sign = root.getObjectByName(`Wayfinding_${view}`);
    assert.equal(sign.parent.name, owner, 'ray picking still resolves the physical content owner');
    const maps = new Set();
    sign.traverse(object => { if (object.material?.map) maps.add(object.material.map); });
    assert.equal(maps.size, 1, 'both sides reuse one icon texture');
    const plaque = sign.children[0], board = plaque.children.find(object => object.geometry?.type === 'ExtrudeGeometry');
    board.geometry.computeBoundingBox();
    const size = board.geometry.boundingBox.getSize(new THREE.Vector3());
    assert(size.x / size.y < 1.5, 'icon signs must not retain the broad two-character boards');
    for (const face of plaque.children.filter(object => object.material?.map)) {
      assert.equal(face.geometry.parameters.width, face.geometry.parameters.height, 'square SVGs retain their proportions');
      assert.equal(face.position.x, 0); assert.equal(face.position.y, 0, 'the icon stays centered in the sign body');
    }
    assert.equal([...maps][0].image.width, [...maps][0].image.height, 'the raster texture cannot squeeze the symbol');
    const source = decodeURIComponent([...maps][0].image.image.src.split(',')[1]);
    const original = readFileSync(require.resolve(`naive-icons/svg/${icon}.svg`), 'utf8');
    assert.equal(source, original.replace('<svg ', '<svg width="256" height="256" '));
    assert.doesNotMatch(source, /<(?:text|foreignObject)\b/i);
    signs.resize(320);
    assert(sign.children[0].scale.x > 1, 'mobile signs remain readable');
    signs.resize(1440);
    assert.equal(sign.children[0].scale.x, 1, 'desktop scale is restored');
  }
  for (const name of ['Bear', 'Rabbit']) assert.equal(root.getObjectByName(name).children.length, 0, 'interaction-only animals do not acquire a navigation sign');
});

test('cancelling image preparation cannot attach signs to an abandoned scene', async t => {
  let finish;
  const decoding = new Promise(resolve => { finish = resolve; });
  const { root } = fixture(t, () => decoding);
  const controller = new AbortController();
  const preparing = createWayfinding(root, controller.signal);
  controller.abort(); finish();
  await assert.rejects(preparing, error => error.name === 'AbortError');
  for (const owner of root.children) assert.equal(owner.children.length, 0);
});

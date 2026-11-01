import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

// Also usable before promotion: ROOM_MODEL_ROOT=.room-build/<candidate>/packed
// node --test scripts/room/delivered-model.test.mjs. No WebGL or image decoding.
const root = process.env.ROOM_MODEL_ROOT
  ? resolve(process.env.ROOM_MODEL_ROOT)
  : fileURLToPath(new URL('../../public/room/materials/', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
let bytes = readFileSync(resolve(root, manifest.model));
if (manifest.modelEncoding === 'gzip') bytes = gunzipSync(bytes);
assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'delivery must contain a GLB');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const nameOf = node => node.extras?.name ?? node.name;
const byName = new Map(gltf.nodes.map(node => [nameOf(node), node]));
const parentOf = new Map();
for (const node of gltf.nodes) for (const index of node.children ?? []) parentOf.set(gltf.nodes[index], node);
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-5, `${message}: ${actual} != ${expected}`);
const mesh = name => {
  const node = byName.get(name);
  assert(node && Number.isInteger(node.mesh), `${name} must remain a real independent mesh`);
  assert(gltf.meshes[node.mesh].primitives.length > 0, `${name} must retain geometry`);
  return node;
};

test('delivered scene has no removed remote or rotary TV control geometry', () => {
  assert.deepEqual([...byName.keys()].filter(name => /^(Desk_Remote|Remote_Key|CRT_Knob)(?:[_.]|$)/.test(name)), []);
});

test('all three delivered TV thumbs retain usable world-X travel and moving index marks', () => {
  const controls = [
    ['Volume', 'volume', 1, .6],
    ['Tracking', 'tracking', 1, 0],
    ['Chroma', 'chroma', 1.6, 1],
  ];
  assert.equal(gltf.nodes.filter(node => node.extras?.slider_id).length, controls.length);
  for (const [title, id, maximum, initial] of controls) {
    const thumb = mesh(`CRT_Slider_${title}`), meta = thumb.extras;
    assert.equal(meta.slider_id, id);
    assert.equal(meta.roomDynamic, true);
    assert.equal(meta.keepIndependent, true);
    assert.equal(meta.slider_coordinate_space, 'gltf-world-x');
    assert(!parentOf.has(thumb), `${title}: absolute world-X contract requires a root mesh`);
    assert.deepEqual(thumb.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]);
    assert.deepEqual(thumb.scale ?? [1, 1, 1], [1, 1, 1]);
    close(meta.slider_value_min, 0, `${title} minimum value`);
    close(meta.slider_value_max, maximum, `${title} maximum value`);
    close(meta.slider_default, initial, `${title} default value`);
    assert(meta.slider_max_x > meta.slider_min_x, `${title}: positive horizontal travel`);
    const initialX = meta.slider_min_x + (meta.slider_max_x - meta.slider_min_x) * initial / maximum;
    close(thumb.translation[0], initialX, `${title} actual thumb position`);
    close(meta.slider_origin_x, initialX, `${title} exported origin`);
    const corners = meta.slider_surface;
    assert.equal(corners?.length, 4, `${title}: four projected control corners`);
    assert(corners.every(point => point.length === 3 && point.every(Number.isFinite)));
    const [tl, tr, br, bl] = corners;
    assert(tl[0] < meta.slider_min_x && tr[0] > meta.slider_max_x, `${title}: hit surface covers full travel`);
    assert(tl[1] > thumb.translation[1] && bl[1] < thumb.translation[1], `${title}: surface contains rail height`);
    close(tl[0], bl[0], `${title} left edge`); close(tr[0], br[0], `${title} right edge`);
    close(tl[1], tr[1], `${title} top edge`); close(bl[1], br[1], `${title} bottom edge`);
    for (const corner of corners) close(corner[2], tl[2], `${title} coplanar surface`);
    assert(tl[2] > thumb.translation[2], `${title}: projected surface is in front of the thumb origin`);
    const stripe = mesh(`CRT_SliderIndex_${title}`);
    assert.equal(parentOf.get(stripe), thumb, `${title}: index must move with thumb`);
    assert.equal(stripe.extras.keepIndependent, true);
    assert.equal(stripe.extras.roomDynamic, true);
    assert.equal(stripe.extras.surface_role, 'print');
  }
});

test('delivered hardware preserves 101 PBT keycaps and distinct equipment finish profiles', () => {
  const caps = gltf.nodes.filter(node => /^Computer_Key(?:[_.]|$)/.test(nameOf(node)) && node.extras?.surface_role !== 'print');
  assert.equal(caps.length, 101, 'physical 101-key layout');
  assert(caps.every(node => node.extras?.surface_profile === 'pbt' && node.extras.atlas === 'equipment'));
  for (const name of ['CRT_Case', 'CRT_ControlPanel', 'Computer_Monitor', 'Computer_Base', 'Computer_Keyboard', 'Computer_Mouse']) {
    assert.equal(mesh(name).extras.surface_profile, 'abs', `${name} ABS profile`);
  }
  assert.equal(mesh('VCR_Body').extras.surface_profile, 'painted-metal');
});

test('delivered hardware corner normals never point through their own triangles', async () => {
  const [{GLTFLoader}, {MeshoptDecoder}, {MeshBasicMaterial, Vector3}] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three'),
  ]);
  // Decode actual delivered geometry, including Meshopt, without images/WebGL.
  const material = new MeshBasicMaterial();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .register(() => ({name: 'geometry-contract', loadMaterial: async () => material}));
  const {scene} = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.traverse(object => { if (object.userData.name) object.name = object.userData.name; });
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), faceNormal = new Vector3(), cornerNormal = new Vector3();
  try {
    for (const name of ['Computer_Monitor', 'Computer_Keyboard', 'Computer_Mouse', 'CRT_Case', 'VCR_Body']) {
      const object = scene.getObjectByName(name);
      assert(object?.isMesh, `${name}: decoded mesh`);
      const {geometry} = object, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      assert(normals, `${name}: decoded vertex normals`);
      const count = geometry.index?.count ?? positions.count;
      let tested = 0;
      for (let offset = 0; offset < count; offset += 3) {
        const indices = [0, 1, 2].map(i => geometry.index?.getX(offset + i) ?? offset + i);
        a.fromBufferAttribute(positions, indices[0]); b.fromBufferAttribute(positions, indices[1]); c.fromBufferAttribute(positions, indices[2]);
        faceNormal.crossVectors(b.sub(a), c.sub(a));
        if (faceNormal.lengthSq() < 1e-20) continue; // Ignore zero-area export seam triangles.
        faceNormal.normalize();
        for (const index of indices) {
          cornerNormal.fromBufferAttribute(normals, index);
          assert(cornerNormal.toArray().every(Number.isFinite), `${name}: finite corner normal`);
          assert(cornerNormal.dot(faceNormal) >= -.001, `${name}: inward corner normal at triangle ${offset / 3}`);
        }
        tested++;
      }
      assert(tested > 0, `${name}: nondegenerate surface triangles`);
    }
  } finally {
    scene.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    material.dispose();
  }
});

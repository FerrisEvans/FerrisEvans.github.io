import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Matrix4, Vector3 } from 'three';

const binary = readFileSync(new URL('../../../public/island/island.glb', import.meta.url));
const report = JSON.parse(readFileSync(new URL('../../../public/island/model-report.json', import.meta.url), 'utf8'));
const document = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString());

test('authored island is a self-contained glTF binary with an honest size and mesh report', () => {
  assert.equal(binary.readUInt32LE(0), 0x46546c67);
  assert.equal(binary.readUInt32LE(4), 2);
  assert.equal(binary.readUInt32LE(8), binary.length);
  assert.equal(binary.readUInt32LE(16), 0x4e4f534a);
  assert.equal(report.bytes, binary.length);
  assert.equal(report.materials, document.materials.length);
  assert.equal(report.meshes, document.meshes.length);
  assert.equal(report.drawCalls, document.meshes.reduce((total, mesh) => total + mesh.primitives.length, 0));
  assert.equal(report.textures, document.textures?.length ?? 0);
  for (const resource of [...document.buffers, ...(document.images ?? [])]) {
    assert(!resource.uri || resource.uri.startsWith('data:'), 'model does not hide external downloads outside the manifest');
  }
  let triangles = 0;
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    triangles += document.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  assert.equal(triangles, report.triangles);
});

test('generic content targets and coordinated character clips survive Blender export', () => {
  const names = new Set(document.nodes.map(node => node.name));
  for (const name of ['Library', 'Dog', 'Rabbit', 'Bear', 'Noticeboard', 'Categories', 'Tags', 'Mailbox', 'Bear_Head', 'Bear_Arm_R', 'Dog_Eye_L', 'Dog_Eye_R', 'Rabbit_Eye_L', 'Rabbit_Eye_R']) {
    assert(names.has(name), `${name} is an exported semantic interaction node`);
  }
  for (const name of ['Idle', 'Attention', 'Wave']) {
    const animation = document.animations.find(animation => animation.name === name);
    assert(animation, `${name} clip exists`);
    assert(animation.channels.some(channel => document.nodes[channel.target.node]?.name?.startsWith('Bear')), `${name} retains actual bear animation channels`);
    assert(new Set(animation.channels.map(channel => channel.target.node)).size >= 2, `${name} moves coordinated parts`);
    for (const channel of animation.channels) {
      assert(document.nodes[channel.target.node]);
      const sampler = animation.samplers[channel.sampler];
      assert(document.accessors[sampler.input].count >= 2, 'animation contains an actual timed movement');
      assert(document.accessors[sampler.output].count >= 2);
    }
  }
});

test('reading and watering props retain real animation channels and anchored ownership', () => {
  const nodes = new Map(document.nodes.map((node, index) => [node.name, { ...node, index }]));
  const parents = new Map(document.nodes.flatMap((node, index) => (node.children ?? []).map(child => [child, index])));
  const ancestors = name => {
    const chain = [];
    for (let index = parents.get(nodes.get(name)?.index); index !== undefined; index = parents.get(index)) chain.push(document.nodes[index].name);
    return chain;
  };
  for (const name of ['Bear_Book', 'Bear_Book_Page', 'Rabbit_WateringCanGrip', 'Rabbit_WateringCan', 'Rabbit_WaterNozzleAnchor', 'Rabbit_WaterTargetAnchor']) {
    assert(nodes.has(name), `${name} survives the exported scene`);
  }
  assert(ancestors('Bear_Book').includes('Bear_Body'), 'the book shares the reading body transform');
  assert(ancestors('Bear_Book_Page').includes('Bear_Book'), 'the page hinge travels with its book');
  const idle = document.animations.find(clip => clip.name === 'Idle');
  for (const name of ['Bear_Book', 'Bear_Book_Page']) {
    assert(idle.channels.some(channel => channel.target.node === nodes.get(name).index), `${name} has a real authored Idle channel`);
  }
  const canAncestors = ancestors('Rabbit_WateringCan');
  assert(canAncestors.includes('Rabbit_WateringCanGrip') && canAncestors.includes('Rabbit_Arm_R'), 'the watering can stays attached to its grip and arm');
  assert(ancestors('Rabbit_WaterNozzleAnchor').includes('Rabbit_WateringCan'), 'the water nozzle follows the tilting can');
  assert(ancestors('Rabbit_WaterTargetAnchor').includes('Environment') && !ancestors('Rabbit_WaterTargetAnchor').includes('Rabbit'), 'water lands on a fixed garden target');
  const extras = nodes.get('Rabbit_WateringCan').extras;
  assert(['x', 'y', 'z'].includes(extras?.pour_axis), 'pouring uses the exported local pivot axis');
  assert(Number.isFinite(extras.pour_angle) && Math.abs(extras.pour_angle) > .01 && Math.abs(extras.pour_angle) < Math.PI / 2, 'the authored pour angle is finite and bounded');
  const flowAxis = nodes.get('Rabbit_WaterNozzleAnchor').extras?.flow_axis;
  assert(Array.isArray(flowAxis) && flowAxis.length === 3 && flowAxis.every(Number.isFinite), 'the real nozzle exports a finite local flow vector');
  assert(Math.abs(Math.hypot(...flowAxis) - 1) < 1e-5, 'the exported nozzle direction is a unit vector');
});

test('street lanterns keep their collision-checked positions and matching light anchors', () => {
  const lanterns = report.assetInstances.filter(instance => instance.file === 'street_lantern.gltf');
  assert.deepEqual(lanterns.map(instance => instance.position), [[-5.85, .25, .45], [5.65, .25, .45]]);
  const names = new Set(document.nodes.map(node => node.name));
  for (const [index, lantern] of lanterns.entries()) {
    const name = `GardenLight_${index}`;
    assert(names.has(name), `${name} survives export for the runtime light`);
    const anchor = report.interactionPivots.find(pivot => pivot.name === name);
    assert(anchor, `${name} is recorded in the layout report`);
    const expected = [lantern.position[0], lantern.position[2] + 4 * lantern.scale[2], -lantern.position[1]].map(value => Number(value.toFixed(5)));
    assert.deepEqual(anchor.positionThree, expected);
  }
});

test('continuous ground texture replaces tiled repetition without altering the terrain mesh', () => {
  const ground = document.nodes.find(node => {
    const sources = node.extras?.vendorAssets ?? [];
    return sources.length === 9 && sources.every(source => source.includes('/floor_grass_sliced_'));
  });
  assert(ground, 'all nine source ground slices remain present');
  const mesh = document.meshes[ground.mesh];
  assert.equal(mesh.primitives.length, 2, 'the top and original sides retain separate materials');
  const materials = mesh.primitives.map(primitive => document.materials[primitive.material]);
  assert(materials.some(material => material.name === 'Garden_continuous_grass'));
  assert(materials.some(material => material.name !== 'Garden_continuous_grass'));
  assert(document.images.some(image => image.name?.includes('Garden_seamless_grass')));
});

test('dog fabric keeps its charcoal tint in the delivered texture pixels', async () => {
  const material = document.materials.find(material => material.name === 'Friend_Dog_fine_charcoal_terry');
  assert(material?.pbrMetallicRoughness?.baseColorTexture, 'the dog has a real fabric color texture');
  const texture = document.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const image = document.images[texture.source];
  const view = document.bufferViews[image.bufferView];
  const start = 20 + binary.readUInt32LE(12) + 8 + (view.byteOffset ?? 0);
  const stats = await sharp(binary.subarray(start, start + view.byteLength)).stats();
  assert.equal(stats.channels.length, 4);
  for (const channel of stats.channels.slice(0, 3)) assert(channel.mean < 60, 'the fabric must stay charcoal rather than turning white after export');
});

test('rabbit keeps a subtle smile without a muzzle or vertical nose line', async () => {
  const names = new Set(document.nodes.map(node => node.name));
  assert(!names.has('Rabbit_PuckeredMouth'));
  const document3d = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(resolve('public/island/island.glb'));
  assert(document3d.getRoot().listMaterials().some(material => material.getName() === 'Friend_Rabbit_face_stitches'));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of document3d.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh().listPrimitives()) {
      if (primitive.getMaterial()?.getName() !== 'Friend_Rabbit_face_stitches') continue;
      const positions = primitive.getAttribute('POSITION');
      for (let index = 0; index < positions.getCount(); index++) {
        const point = new Vector3().fromArray(positions.getElement(index, [])).applyMatrix4(matrix);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
    }
  }
  assert(maxX - minX > .03, 'the subtle smile spans both sides of the nose');
  assert(maxY - minY < .025, 'no vertical line may connect the nose and smile');
});

test('every adopted source model is licensed, hash-verified and present in exported mesh provenance', () => {
  const exported = new Set([...document.nodes, ...document.meshes].flatMap(object => object.extras?.vendorAssets ?? []));
  const reported = new Set();
  const packs = new Set();
  for (const asset of report.externalAssets ?? []) {
    assert.match(asset.source, /^public\/island\/vendor\/[^/]+\/SOURCE\.json$/);
    const folder = dirname(asset.source), pack = basename(folder);
    const source = JSON.parse(readFileSync(resolve(folder, 'SOURCE.json'), 'utf8'));
    assert.equal(asset.license, source.license);
    assert.equal(asset.author, source.author);
    assert.equal(source.license, 'CC0-1.0');
    assert(source.files.some(file => file.file === source.licenseFile), 'the original license is retained and hash-verified');
    for (const file of source.files) {
      const bytes = readFileSync(resolve(folder, file.file));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    assert(asset.models.length > 0, 'the report does not claim a pack without using a model');
    for (const model of asset.models) {
      assert(source.selectedModels.some(candidate => candidate.file === model.file), `${model.file} is in the preserved source inventory`);
      const id = `${pack}/${model.file}`;
      assert(exported.has(id), `${id} is represented by a real exported mesh`);
      reported.add(id);
    }
    packs.add(pack);
  }
  assert.deepEqual(exported, reported, 'merged mesh provenance and the actual-use report cover the same source models');
  for (const pack of ['kaykit-forest-nature-1.0', 'kaykit-furniture-bits-1.0', 'tinytreats-pretty-park-1.0', 'tinytreats-house-plants-1.0', 'tinytreats-pleasant-picnic-1.0-full']) {
    assert(packs.has(pack), `${pack} contributes actual geometry to the rebuilt courtyard`);
  }
});

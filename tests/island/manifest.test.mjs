import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { modelManifest, verifyManifest, fileRecord, posterSizes } from '../../scripts/island/manifest.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'island-seals-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (file, value) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), value);
  };
  for (const [file, bytes] of Object.entries({
    'scripts/island/build_scene.py': 'original scene source',
    'assets/island/island.blend': 'editable Blender source',
    'assets/island/island.glb': 'authored glTF source',
    'scripts/island/pack-model.mjs': 'lossless delivery packer',
    'public/island/island.glb.bin': 'delivered model',
    'src/scripts/island/scene.ts': 'rendering source',
    'src/styles/world.css': 'capture framing source',
    'src/styles/island-tooltip.css': 'shared tooltip styles',
    'node_modules/three/package.json': '{"version":"0.186.1"}',
    'node_modules/naive-icons/svg/book.svg': '<svg><path id="book"/></svg>',
    'node_modules/naive-icons/svg/grid.svg': '<svg><path id="grid"/></svg>',
    'node_modules/naive-icons/svg/tag.svg': '<svg><path id="tag"/></svg>',
  })) await write(file, bytes);
  return { root, write };
}

test('geometry, authoring source and renderer changes invalidate the same scene build', async t => {
  const { root, write } = await fixture(t);
  const baseline = await modelManifest(root);
  await verifyManifest(baseline, root, { modelOnly: true });
  for (const file of ['public/island/island.glb.bin', 'scripts/island/build_scene.py', 'assets/island/island.blend', 'src/scripts/island/scene.ts', 'src/styles/world.css']) {
    const original = await readFile(join(root, file));
    await write(file, `changed ${file}`);
    await assert.rejects(verifyManifest(baseline, root, { modelOnly: true }), /sources changed/);
    assert.notEqual((await modelManifest(root)).buildId, baseline.buildId);
    await write(file, original);
  }
});

test('each shared navigation icon invalidates the poster seal when its SVG changes', async t => {
  const { root, write } = await fixture(t);
  const baseline = await modelManifest(root);
  for (const icon of ['book', 'grid', 'tag']) {
    const file = `node_modules/naive-icons/svg/${icon}.svg`;
    assert(baseline.sources[file], `${icon} belongs to the scene source seal`);
    const original = await readFile(join(root, file));
    await write(file, `<svg><path id="updated-${icon}"/></svg>`);
    await assert.rejects(verifyManifest(baseline, root, { modelOnly: true }), /sources changed/);
    assert.notEqual((await modelManifest(root)).buildId, baseline.buildId);
    await write(file, original);
    await verifyManifest(baseline, root, { modelOnly: true });
  }
});

test('all split Blender authoring modules invalidate the seal independently', async t => {
  const { root, write } = await fixture(t);
  const modules = ['geometry.py', 'character.py', 'vendor.py', 'export_scene.py'];
  for (const module of modules) await write(`scripts/island/${module}`, `original ${module}`);
  const baseline = await modelManifest(root);
  for (const module of modules) {
    const file = `scripts/island/${module}`;
    assert(baseline.sources[file]);
    await write(file, `changed ${module}`);
    await assert.rejects(verifyManifest(baseline, root, { modelOnly: true }), /sources changed/);
    await write(file, `original ${module}`);
    await verifyManifest(baseline, root, { modelOnly: true });
  }
  await write('scripts/island/new_authoring_helper.py', 'new module');
  await assert.rejects(verifyManifest(baseline, root, { modelOnly: true }), /sources changed/);
  await rm(join(root, 'scripts/island/new_authoring_helper.py'));
  await rm(join(root, 'scripts/island/geometry.py'));
  await assert.rejects(verifyManifest(baseline, root, { modelOnly: true }), /sources changed/);
});

test('publication requires byte-exact day, night and sharing captures of that build', async t => {
  const { root, write } = await fixture(t);
  const manifest = await modelManifest(root);
  await assert.rejects(verifyManifest(manifest, root), /posters belong/);
  manifest.posters = { buildId: manifest.buildId, framing: { halfWidth: 7, halfHeight: 5 }, files: {} };
  for (const [file, [width, height]] of Object.entries(posterSizes)) {
    await write(`public/island/${file}`, `captured image ${file}`);
    manifest.posters.files[file] = { ...await fileRecord(join(root, 'public/island', file)), width, height };
  }
  await verifyManifest(manifest, root);
  await write('public/island/cover-night.webp', 'unsealed replacement');
  await assert.rejects(verifyManifest(manifest, root), /cover-night.webp/);
});

test('the initial core resource budget is enforced before deployment', async t => {
  const { root, write } = await fixture(t);
  await write('public/island/island.glb.bin', Buffer.alloc(5_000_001));
  await assert.rejects(verifyManifest(await modelManifest(root), root, { modelOnly: true }), /5 MB/);
});

test('adopted vendor geometry, textures and their license/provenance participate in the source seal', async t => {
  const { root, write } = await fixture(t);
  const files = ['prop.gltf', 'prop.bin', 'palette.png', 'LICENSE.txt', 'SOURCE.json'];
  for (const file of files) await write(`assets/island/vendor/example/${file}`, `pinned ${file}`);
  const manifest = await modelManifest(root);
  for (const file of files) assert(manifest.sources[`assets/island/vendor/example/${file}`]);
  await verifyManifest(manifest, root, { modelOnly: true });
  await write('assets/island/vendor/example/LICENSE.txt', 'changed license');
  await assert.rejects(verifyManifest(manifest, root, { modelOnly: true }), /sources changed/);
});

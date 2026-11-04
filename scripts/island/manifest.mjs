import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const posterSizes = {
  'cover-day.webp': [1440, 1200],
  'cover-night.webp': [1440, 1200],
  'share.jpg': [1200, 630],
};
export async function fileRecord(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}
async function sourceFiles(directory, accept = name => /\.(?:ts|js)$/.test(name)) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = await Promise.all(entries.map(entry => entry.isDirectory()
    ? sourceFiles(resolve(directory, entry.name), accept)
    : accept(entry.name) ? [resolve(directory, entry.name)] : []));
  return files.flat();
}
/** Poster identity includes every authored geometry and runtime rendering input. */
export async function modelManifest(root = process.cwd()) {
  const sourcePaths = [
    'scripts/island/build_scene.py',
    ...await sourceFiles(resolve(root, 'scripts/island'), name => name.endsWith('.py'))
      .then(files => files.map(file => relative(root, file)).filter(file => file !== 'scripts/island/build_scene.py')),
    'assets/island/island.blend',
    'assets/island/island.glb',
    'scripts/island/pack-model.mjs',
    'src/styles/world.css',
    'src/styles/island-tooltip.css',
    ...await sourceFiles(resolve(root, 'src/scripts/island')).then(files => files.map(file => relative(root, file))),
    ...await sourceFiles(resolve(root, 'assets/island/vendor'), name => name !== '.DS_Store').then(files => files.map(file => relative(root, file))),
    ...await sourceFiles(resolve(root, 'assets/island/references'), name => name !== '.DS_Store').then(files => files.map(file => relative(root, file))),
  ].sort();
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(root, path)))])));
  const model = { file: 'island.glb.bin', encoding: 'gzip', ...await fileRecord(resolve(root, 'public/island/island.glb.bin')) };
  const threeVersion = JSON.parse(await readFile(resolve(root, 'node_modules/three/package.json'))).version;
  const inputs = { model, sources, threeVersion };
  return { schemaVersion: 1, buildId: sha256(JSON.stringify(inputs)).slice(0, 20), ...inputs };
}
export async function verifyManifest(manifest, root = process.cwd(), { modelOnly = false } = {}) {
  const current = await modelManifest(root);
  if (JSON.stringify(current) !== JSON.stringify(Object.fromEntries(Object.keys(current).map(key => [key, manifest[key]])))) {
    throw new Error('Island model or rendering sources changed; run npm run assets:model, then npm run assets:posters.');
  }
  if (manifest.model.bytes > 5_000_000) throw new Error('Island core model exceeds the initial 5 MB resource budget.');
  if (modelOnly) return current;
  if (manifest.posters?.buildId !== manifest.buildId) throw new Error('Island posters belong to a different build; run npm run assets:posters.');
  if (!['halfWidth', 'halfHeight'].every(key => Number.isFinite(manifest.posters.framing?.[key]) && manifest.posters.framing[key] > 0)) {
    throw new Error('Island posters need the matching camera framing; run npm run assets:posters.');
  }
  for (const [file, [width, height]] of Object.entries(posterSizes)) {
    const record = manifest.posters.files?.[file];
    const actual = await fileRecord(resolve(root, 'public/island', file));
    if (!record || record.sha256 !== actual.sha256 || record.bytes !== actual.bytes || record.width !== width || record.height !== height) {
      throw new Error(`Island poster seal differs: ${file}; run npm run assets:posters.`);
    }
  }
  return current;
}

#!/usr/bin/env node
// Run after screenshot/render producers finish. Dry run unless --apply is present.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'docs/island');
const reportPath = resolve(directory, 'preview-compression.json');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const archiveArgument = args.indexOf('--archive-root');
const archiveRoot = archiveArgument >= 0 ? resolve(args[archiveArgument + 1] ?? '') : undefined;
if (apply && !archiveRoot) throw new Error('--apply requires --archive-root outside the repository');
if (archiveRoot && (archiveRoot === root || archiveRoot.startsWith(`${root}/`))) {
  throw new Error('Archive originals outside the repository');
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = path => stat(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]))).flat().sort();
}
const files = await walk(directory);
const images = files.filter(path => path.endsWith('.png'));
const beforeBytes = (await Promise.all(images.map(path => stat(path)))).reduce((sum, item) => sum + item.size, 0);
if (!apply) {
  console.log(JSON.stringify({ dryRun: true, imageCount: images.length, beforeBytes,
    options: { quality: 92, effort: 6 }, files: images.map(path => relative(root, path)) }, null, 2));
  process.exit(0);
}
const previous = await exists(reportPath) ? JSON.parse(await readFile(reportPath, 'utf8')) : { images: [] };
if (!images.length) {
  console.log(JSON.stringify({ unchanged: true, imageCount: previous.images.length, report: relative(root, reportPath) }));
  process.exit(0);
}
const converted = [];
for (const source of images) {
  const input = await readFile(source);
  const sourceHash = sha256(input);
  const sourcePath = relative(root, source);
  let archived = resolve(archiveRoot, sourcePath);
  if (await exists(archived) && sha256(await readFile(archived)) !== sourceHash) {
    // A newer capture with the same filename must not overwrite an earlier original.
    archived = resolve(archiveRoot, 'versions', sourceHash, sourcePath);
  }
  await mkdir(dirname(archived), { recursive: true });
  if (!await exists(archived)) await copyFile(source, archived);
  if (sha256(await readFile(archived)) !== sourceHash) throw new Error(`Archive hash mismatch: ${sourcePath}`);
  const output = await sharp(input).webp({ quality: 92, effort: 6 }).toBuffer();
  const sourceMetadata = await sharp(input).metadata();
  const outputMetadata = await sharp(output).metadata();
  if (sourceMetadata.width !== outputMetadata.width || sourceMetadata.height !== outputMetadata.height) {
    throw new Error(`Dimensions changed: ${sourcePath}`);
  }
  if (sha256(await readFile(source)) !== sourceHash) throw new Error(`Producer is still writing: ${sourcePath}`);
  const destination = source.replace(/\.png$/, '.webp');
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, output);
  await rename(temporary, destination);
  await unlink(source);
  converted.push({ source: sourcePath, display: relative(root, destination), archive: archived,
    originalBytes: input.length, displayBytes: output.length, originalSha256: sourceHash,
    displaySha256: sha256(output), width: sourceMetadata.width, height: sourceMetadata.height });
}

// Replace only paths for images actually converted, never image-source names or hashes.
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rewritePaths(text, document) {
  const mappings = new Map();
  for (const image of converted) {
    const source = resolve(root, image.source);
    const destination = resolve(root, image.display);
    const pairs = [[image.source, image.display], [source, destination],
      [relative(directory, source), relative(directory, destination)],
      [relative(dirname(document), source), relative(dirname(document), destination)]];
    for (const [from, to] of pairs) mappings.set(from, to);
  }
  for (const [from, to] of [...mappings].sort((a, b) => b[0].length - a[0].length)) {
    const pattern = new RegExp(`(^|[^\\w/.-])${escapeRegExp(from)}(?=$|[^\\w/.-])`, 'g');
    text = text.replace(pattern, (_, prefix) => prefix + to);
  }
  return text;
}
function rewriteJson(value, document, key = '') {
  if (/sha|hash|digest|checksum|archive|original/i.test(key)) return value;
  if (typeof value === 'string') return rewritePaths(value, document);
  if (Array.isArray(value)) return value.map(item => rewriteJson(item, document));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([name, item]) => [name, rewriteJson(item, document, name)]));
  return value;
}
const documentsChanged = [];
for (const document of files.filter(path => /\.(md|json)$/.test(path))) {
  // QA.md is authored after final evidence; browser metrics may be written concurrently.
  if ([reportPath, resolve(directory, 'asset-cleanup.json'), resolve(directory, 'preview-archive.json'),
    resolve(directory, 'QA.md'), resolve(directory, 'browser-metrics.json')].includes(document)) continue;
  const before = await readFile(document, 'utf8');
  let after;
  if (document.endsWith('.json')) {
    const parsed = JSON.parse(before);
    const updated = rewriteJson(parsed, document);
    if (JSON.stringify(parsed) === JSON.stringify(updated)) continue;
    after = `${JSON.stringify(updated, null, 2)}\n`;
  } else after = rewritePaths(before, document);
  if (after !== before) {
    await writeFile(document, after);
    documentsChanged.push(relative(root, document));
  }
}
const note = 'WebP files are quality-92 display copies. Pixel comparisons, outline measurements and existing acceptance conclusions were computed from the original PNGs, not these lossy copies. Original PNGs are preserved outside the repository; each archive path and SHA-256 is recorded here. No existing hash fields or numeric test conclusions were changed.';
const bySource = new Map(previous.images.map(image => [image.source, image]));
for (const image of converted) {
  const old = bySource.get(image.source);
  if (old && old.originalSha256 !== image.originalSha256) {
    image.previousVersions = [...(old.previousVersions ?? []), { ...old, previousVersions: undefined }];
  } else if (old?.previousVersions) image.previousVersions = old.previousVersions;
  bySource.set(image.source, image);
}
const allImages = [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
const totalBeforeBytes = allImages.reduce((sum, image) => sum + image.originalBytes, 0);
const totalAfterBytes = allImages.reduce((sum, image) => sum + image.displayBytes, 0);
const report = { schema: 1, generatedAt: new Date().toISOString(), command:
  'node scripts/compact-island-previews.mjs --archive-root <outside-repository-directory> --apply',
  options: { format: 'webp', quality: 92, effort: 6, resize: false }, note,
  imageCount: allImages.length, beforeBytes: totalBeforeBytes, afterBytes: totalAfterBytes,
  savedBytes: totalBeforeBytes - totalAfterBytes,
  savedPercent: Number((100 * (1 - totalAfterBytes / totalBeforeBytes)).toFixed(2)),
  documentsChanged: [...new Set([...(previous.documentsChanged ?? []), ...documentsChanged])].sort(), images: allImages };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ imageCount: report.imageCount, beforeBytes: report.beforeBytes,
  afterBytes: report.afterBytes, savedPercent: report.savedPercent, report: relative(root, reportPath) }, null, 2));

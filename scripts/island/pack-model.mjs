#!/usr/bin/env node
/** Lossless delivery packaging; authored geometry, pivots and animation stay intact.
 * Optional positional arguments: source.glb output.glb.bin transport.json.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [sourceArg, outputArg, reportArg] = process.argv.slice(2);
const sourcePath = sourceArg ? resolve(sourceArg) : resolve(root, 'public/assets/island/island.glb');
const outputPath = outputArg ? resolve(outputArg) : resolve(root, 'public/island/island.glb.bin');
const reportPath = reportArg ? resolve(reportArg) : resolve(root, 'public/island/transport.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

function accessorIdentity(accessor) {
  if (!accessor) return null;
  return { type: accessor.getType(), componentType: accessor.getComponentType(),
    normalized: accessor.getNormalized(), count: accessor.getCount(), sha256: sha256(bytesOf(accessor.getArray())) };
}

function sceneIdentity(document) {
  const root = document.getRoot(), nodes = root.listNodes(), meshes = root.listMeshes();
  return {
    nodes: nodes.map(node => ({ name: node.getName(), extras: node.getExtras(), matrix: node.getMatrix(),
      children: node.listChildren().map(child => nodes.indexOf(child)), mesh: meshes.indexOf(node.getMesh()), weights: node.getWeights() })),
    scenes: root.listScenes().map(scene => ({ name: scene.getName(), extras: scene.getExtras(),
      children: scene.listChildren().map(child => nodes.indexOf(child)) })),
    defaultScene: root.listScenes().indexOf(root.getDefaultScene()),
    meshes: meshes.map(mesh => ({ name: mesh.getName(), extras: mesh.getExtras(), weights: mesh.getWeights() })),
  };
}

/** Hash every attribute at every triangle corner, allowing only cyclic corner
 * rotation from the lossless index codec. Winding and duplicate faces matter.
 */
function geometryIdentity(document) {
  const materials = document.getRoot().listMaterials();
  return document.getRoot().listMeshes().map(mesh => mesh.listPrimitives().map(primitive => {
    const streams = [primitive, ...primitive.listTargets()].flatMap((target, index) =>
      target.listSemantics().sort().map(semantic => ({ semantic: `${index}:${semantic}`, accessor: target.getAttribute(semantic) })));
    const position = primitive.getAttribute('POSITION');
    assert(position, 'Every delivered primitive must have positions');
    const indices = primitive.getIndices()?.getArray() ?? Array.from({ length: position.getCount() }, (_, index) => index);
    const vertex = index => streams.map(({ accessor }) => {
      const array = accessor.getArray(), stride = accessor.getElementSize() * array.BYTES_PER_ELEMENT;
      return Buffer.from(array.buffer, array.byteOffset + index * stride, stride).toString('hex');
    }).join(':');
    const corners = Array.from(indices, vertex);
    let faces = corners;
    if (primitive.getMode() === 4) {
      assert.equal(corners.length % 3, 0, 'Triangle index count must be divisible by three');
      faces = [];
      for (let index = 0; index < corners.length; index += 3) {
        const [a, b, c] = corners.slice(index, index + 3);
        faces.push([`${a};${b};${c}`, `${b};${c};${a}`, `${c};${a};${b}`].sort()[0]);
      }
      faces.sort();
    }
    return { mode: primitive.getMode(), extras: primitive.getExtras(), material: materials.indexOf(primitive.getMaterial()),
      corners: corners.length, streams: streams.map(({ semantic, accessor }) => ({ semantic, type: accessor.getType(),
        componentType: accessor.getComponentType(), normalized: accessor.getNormalized() })), sha256: sha256(faces.join('\n')) };
  }));
}

function animationIdentity(document) {
  const nodes = document.getRoot().listNodes();
  return document.getRoot().listAnimations().map(animation => ({ name: animation.getName(), extras: animation.getExtras(),
    channels: animation.listChannels().map(channel => ({ target: nodes.indexOf(channel.getTargetNode()), path: channel.getTargetPath(),
      interpolation: channel.getSampler().getInterpolation(), input: accessorIdentity(channel.getSampler().getInput()),
      output: accessorIdentity(channel.getSampler().getOutput()) })) }));
}

function unpackGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected glTF binary input');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected glTF 2');
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  return { json, binary: bytes.subarray(28 + length) };
}

const imagePixels = new Map();
async function pixelIdentity(bytes) {
  const hash = sha256(bytes);
  if (!imagePixels.has(hash)) {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    imagePixels.set(hash, { width: info.width, height: info.height, channels: info.channels, sha256: sha256(data) });
  }
  return imagePixels.get(hash);
}

/** Normalize only equivalent glTF defaults and texture table indices. This
 * detects unintended material changes introduced by import/export as well.
 */
async function materialIdentity(bytes) {
  const { json, binary } = unpackGlb(bytes);
  const images = await Promise.all(json.images.map(image => {
    const view = json.bufferViews[image.bufferView], start = view.byteOffset ?? 0;
    return pixelIdentity(binary.subarray(start, start + view.byteLength));
  }));
  const textures = json.textures.map(texture => ({ image: images[texture.extensions?.EXT_texture_webp?.source ?? texture.source],
    sampler: { wrapS: 10497, wrapT: 10497, ...json.samplers?.[texture.sampler] } }));
  function canonical(value, parent = '') {
    if (Array.isArray(value)) return value.map(item => canonical(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).sort().map(([key, item]) =>
      [key, key === 'index' && parent.endsWith('Texture') ? textures[item] : canonical(item, key)]));
  }
  return json.materials.map(material => {
    if (material.extensions?.KHR_materials_clearcoat) material.extensions.KHR_materials_clearcoat =
      { clearcoatFactor: 0, ...material.extensions.KHR_materials_clearcoat };
    return canonical(material);
  });
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const source = await readFile(sourcePath), document = await io.readBinary(source);
const before = { scene: sceneIdentity(document), geometry: geometryIdentity(document),
  animations: animationIdentity(document), materials: await materialIdentity(source) };
const images = [];
for (const texture of document.getRoot().listTextures()) {
  const original = texture.getImage(), pixels = await pixelIdentity(original);
  // Different effort presets occasionally produce a larger lossless image.
  // Pick the smallest deterministic result instead of assuming more is better.
  const choices = await Promise.all([1, 4, 6].map(effort => sharp(original).webp({ lossless: true, effort }).toBuffer()));
  const encoded = choices.sort((a, b) => a.length - b.length)[0];
  assert.deepEqual(await pixelIdentity(encoded), pixels, `Texture pixels changed: ${texture.getName()}`);
  texture.setImage(encoded).setMimeType('image/webp');
  images.push({ name: texture.getName(), sourceBytes: original.length, bytes: encoded.length,
    width: pixels.width, height: pixels.height, pixelsSha256: pixels.sha256, pixelsExact: true });
}
document.createExtension(EXTTextureWebP).setRequired(true);
// No quantize(), reorder(), simplification or mesh merging. QUANTIZE here is
// the extension's no-filter encoding mode, not a request to change float data.
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const packed = Buffer.from(await io.writeBinary(document)), decoded = await io.readBinary(packed);
assert.deepEqual(sceneIdentity(decoded), before.scene, 'Scene nodes, pivots or hierarchy changed');
assert.deepEqual(geometryIdentity(decoded), before.geometry, 'Geometry attributes or triangle winding changed');
assert.deepEqual(animationIdentity(decoded), before.animations, 'Animation data changed');
assert.deepEqual(await materialIdentity(packed), before.materials, 'Material appearance changed');
const compressed = gzipSync(packed, { level: 9 });
assert(gunzipSync(compressed).equals(packed), 'Gzip round trip changed the model');
assert(compressed.length < source.length, 'Packing must reduce the delivered model size');
const report = {
  schemaVersion: 1, source: relative(root, sourcePath), sourceSha256: sha256(source),
  packerSha256: sha256(await readFile(fileURLToPath(import.meta.url))), file: basename(outputPath),
  sourceBytes: source.length, bytes: compressed.length, packedBytes: packed.length,
  sha256: sha256(compressed), packedSha256: sha256(packed), compression: 'gzip',
  extension: 'EXT_meshopt_compression', textureExtension: 'EXT_texture_webp',
  integrity: { nodesExact: true, attributesAndWindingExact: true, animationValuesExact: true,
    materialsEquivalent: true, imagePixelsExact: true, quantization: false, reordered: false },
  nodes: decoded.getRoot().listNodes().length, meshes: decoded.getRoot().listMeshes().length,
  materials: decoded.getRoot().listMaterials().length, animations: before.animations.map(animation => ({
    name: animation.name, channels: animation.channels.length })), images,
};
for (const [path, contents] of [[outputPath, compressed], [reportPath, JSON.stringify(report, null, 2) + '\n']]) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + '.tmp', contents);
  await rename(path + '.tmp', path);
}
console.log(`Packed island: ${source.length} → ${compressed.length} bytes (${(100 * (1 - compressed.length / source.length)).toFixed(1)}% smaller); geometry, animation and texture pixels unchanged.`);

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import type { RoomAssets } from './assets';

/** Unwrap gzip, then decode optional Meshopt geometry. Build packing retains all
 * positions, transforms and names; only normals and UVs use 16-bit quantization. */
export async function loadRoomModel(assets?: RoomAssets, onMesh?: (completed: number, total: number) => void) {
  const read = async (url: string) => {
    if (assets) return assets.read(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Scene resource: ${response.status}`);
    return response.arrayBuffer();
  };
  const manifest = JSON.parse(new TextDecoder().decode(await read('/room/materials/manifest.json')));
  const file = manifest.model ?? 'study.glb';
  let data = await read('/room/materials/' + file);
  if (manifest.modelEncoding === 'gzip') {
    const endDecompress = assets?.timing?.start('model.decompress', {inputBytes: data.byteLength, decoder: typeof DecompressionStream === 'function' ? 'DecompressionStream' : 'fflate-sync'});
    // Let the browser decompress off the main thread while the loading OSD
    // remains responsive. Keep the existing decoder for older browsers.
    try {
      data = typeof DecompressionStream === 'function'
        ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : gunzipSync(new Uint8Array(data)).buffer as ArrayBuffer;
      endDecompress?.('ok', {outputBytes: data.byteLength});
    } catch (error) { endDecompress?.('error', {error: String(error)}); throw error; }
  }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(parser => {
    let queue = Promise.resolve(), sliceStart = performance.now(), completed = 0;
    return {
      name: 'MAINLOOP_cooperative_meshes',
      loadMesh(index) {
        // Promise.all across hundreds of meshes otherwise keeps the entire
        // parse in one microtask burst. Preserve parser caches and hierarchy,
        // but let input and the OSD paint between short construction batches.
        const mesh = queue.then(async () => {
          if (performance.now() - sliceStart > 8) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            sliceStart = performance.now();
          }
          const result = await parser.loadMesh(index);
          onMesh?.(++completed, parser.json.meshes.length);
          return result;
        });
        queue = mesh.then(() => {}, () => {});
        return mesh;
      },
    };
  });
  const endParse = assets?.timing?.start('model.parse', {bytes: data.byteLength});
  let gltf: Awaited<ReturnType<GLTFLoader['parseAsync']>>;
  try { gltf = await loader.parseAsync(data, '/room/materials/'); endParse?.(); }
  catch (error) { endParse?.('error', {error: String(error)}); throw error; }
  // GLTFLoader strips dots for animation binding. This independently authored
  // model has no clip bindings; restore Blender's unique names for controls
  // such as Calculator_Key.019 and VCR_Key.003.
  gltf.scene.traverse(object => {
    if (typeof object.userData.name === 'string') object.name = object.userData.name;
  });
  return gltf;
}

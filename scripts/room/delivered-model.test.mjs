import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

// Also usable before promotion: ROOM_MODEL_ROOT=.room-build/<candidate>/packed
// node --test scripts/room/delivered-model.test.mjs. No WebGL or image decoding.
// ROOM_ANCHORS_FILE can pair a previous build with its own source anchors.
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
async function decodeDelivered() {
  const [{GLTFLoader}, {MeshoptDecoder}, {Box3, MeshBasicMaterial, Vector3}] = await Promise.all([
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
  scene.updateMatrixWorld(true);
  return {scene, Box3, Vector3, dispose() {
    scene.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    material.dispose();
  }};
}

test('desktop layout keeps both families on the desk and exposes the ABOUT floppy in the default frame', async () => {
  if(!manifest.desktopLayout)return; // Archived deliveries keep their own placement contract.
  const {scene,Box3,Vector3,dispose}=await decodeDelivered();
  const {Raycaster}=await import('three');
  try{
    const recipe=manifest.desktopLayout.objects;
    for(const name of ['Desk_Floppy','Desk_CD']){
      const object=scene.getObjectByName(name),spec=recipe[name];
      assert(object?.isMesh,name+' root must remain authored geometry');
      object.getWorldPosition(new Vector3()).toArray().forEach((value,i)=>close(value,spec.position[i],name+' position'));
      object.getWorldScale(new Vector3()).toArray().forEach(value=>close(value,spec.scale,name+' scale'));
      const bounds=new Box3();scene.traverse(part=>{if(part.name===name||part.name.startsWith(name+'_'))bounds.union(new Box3().setFromObject(part,true));});
      close(bounds.min.y,new Box3().setFromObject(scene.getObjectByName('Desk_Top'),true).max.y,name+' floor contact');
    }
    const floppy=scene.getObjectByName('Desk_Floppy'),label=scene.getObjectByName('Desk_Floppy_Print');
    assert.equal(label.userData.print_text,'ABOUT');
    assert.equal(label.parent,floppy,'printed ink follows the authored disk');
    const camera=scene.getObjectByName('HomeCamera');
    const horizontal=Math.tan(camera.fov*Math.PI/360)*camera.aspect;
    camera.aspect=1920/1080;camera.fov=2*Math.atan(horizontal/camera.aspect)*180/Math.PI;
    camera.updateProjectionMatrix();scene.updateMatrixWorld(true);
    floppy.geometry.computeBoundingBox();const b=floppy.geometry.boundingBox;
    const eye=camera.getWorldPosition(new Vector3()),ray=new Raycaster();
    // Sample every corner and edge on the top face: a clear footprint alone
    // did not catch the higher paper/keyboard hiding the old disk from camera.
    for(const [u,v]of [[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]]){
      const inset=.0045; // Inside the authored 4 mm corner fillet.
      const point=new Vector3(b.min.x+inset+(b.max.x-b.min.x-2*inset)*u,b.max.y-.0001,b.min.z+inset+(b.max.z-b.min.z-2*inset)*v).applyMatrix4(floppy.matrixWorld);
      const screen=point.clone().project(camera);
      assert(screen.x>-1&&screen.x<1&&screen.y>-1&&screen.y<1,'floppy outline stays inside the 1920×1080 default frame');
      assert((1-screen.y)*540<1029,'floppy clears the bottom controls');
      ray.set(eye,point.clone().sub(eye).normalize());
      const hit=ray.intersectObject(scene,true)[0];
      assert(hit?.object.name.startsWith('Desk_Floppy'),'paper or keyboard must not cover the disk outline: '+hit?.object.name);
    }
  }finally{dispose();}
});

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

test('delivered soil stays inside its pot and exposes front-facing earth below the rim', async () => {
  const {scene, Box3, Vector3, dispose} = await decodeDelivered();
  const {Raycaster, FrontSide} = await import('three');
  try {
    const pot = scene.getObjectByName('Plant_Pot'), soil = scene.getObjectByName('Plant_Pot_Soil');
    assert(pot?.isMesh && soil?.isMesh, 'pot and soil must both survive atlas separation');
    const potBounds = new Box3().setFromObject(pot), soilBounds = new Box3().setFromObject(soil);
    assert(potBounds.clone().expandByScalar(.001).containsBox(soilBounds),
      'soil world bounds must remain inside the pot after separate atlas joins');
    const center = potBounds.getCenter(new Vector3()), size = potBounds.getSize(new Vector3());
    assert(soilBounds.min.y > potBounds.min.y + size.y*.7 && soilBounds.max.y < potBounds.max.y-.005,
      'earth must fill the upper pot while leaving a real recessed ceramic rim');
    soil.material.side = FrontSide;
    for (const [x,z] of [[.25,0],[-.25,0],[0,.25],[0,-.25]]) {
      const origin = new Vector3(center.x+x*size.x,potBounds.max.y+.05,center.z+z*size.z);
      const ray = new Raycaster(origin,new Vector3(0,-1,0),0,size.y+.1);
      const hit = ray.intersectObjects([soil,pot],false)[0];
      assert.equal(hit?.object,soil,'looking into the pot must reveal front-facing soil before white ceramic');
    }
  } finally { dispose(); }
});

test('delivered hardware corner normals never point through their own triangles', async () => {
  const {scene, Vector3, dispose} = await decodeDelivered();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), faceNormal = new Vector3(), cornerNormal = new Vector3();
  try {
    for (const name of ['Computer_Monitor', 'Computer_Keyboard', 'Computer_Mouse', 'CRT_Case', 'VCR_Body',
      'Retro_Phone', 'Retro_Phone_Handset', 'Retro_Phone_DialWheel']) {
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
    dispose();
  }
});

test('delivered flat monitor bezels do not interpolate aperture normals across their front panels', async () => {
  const {scene, Vector3, dispose} = await decodeDelivered();
  const failures = [];
  try {
    for (const name of ['CRT_Case', 'Computer_Monitor']) {
      const object = scene.getObjectByName(name);
      assert(object?.isMesh, `${name}: decoded housing`);
      const {geometry} = object, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      assert(normals, `${name}: delivered corner normals`);
      geometry.computeBoundingBox();
      const front = geometry.boundingBox.max.z;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), faceNormal = new Vector3(), cornerNormal = new Vector3();
      let tested = 0, minimumDot = 1;
      for (let offset = 0; offset < (geometry.index?.count ?? positions.count); offset += 3) {
        const indices = [0,1,2].map(i => geometry.index?.getX(offset+i) ?? offset+i);
        a.fromBufferAttribute(positions,indices[0]); b.fromBufferAttribute(positions,indices[1]); c.fromBufferAttribute(positions,indices[2]);
        if ([a,b,c].some(point => Math.abs(point.z-front) > .00001)) continue;
        faceNormal.crossVectors(b.sub(a),c.sub(a));
        // Inspect visible broad panels, excluding the small rounded edge strips.
        if (faceNormal.length()*.5 < .0001) continue;
        faceNormal.normalize();
        if (faceNormal.z < .9999) continue;
        for (const index of indices) {
          cornerNormal.fromBufferAttribute(normals,index).normalize();
          minimumDot = Math.min(minimumDot,cornerNormal.dot(faceNormal));
        }
        tested++;
      }
      assert(tested >= 2, `${name}: broad coplanar front panel must remain present`);
      // The observed regression tilted corners 32–51 degrees into the recess,
      // creating diagonal highlights on a flat shell. Allow <6 degrees for
      // exported normal quantization without accepting that geometry defect.
      if (minimumDot < .995) failures.push(`${name}: front normal dot ${minimumDot.toFixed(6)} < 0.995`);
    }
    assert.deepEqual(failures, [], 'flat bezel panels must retain planar shading');
  } finally { dispose(); }
});

test('delivered telephone finger holes reveal an unobstructed number plate with no coplanar bezel', async () => {
  const {scene, Box3, Vector3, dispose} = await decodeDelivered();
  const {Raycaster, DoubleSide} = await import('three');
  try {
    const plate = scene.getObjectByName('Retro_Phone_DialNumberPlate');
    const bezel = scene.getObjectByName('Retro_Phone_DialBezel');
    const wheel = scene.getObjectByName('Retro_Phone_DialWheel');
    assert(plate?.isMesh && bezel?.isMesh && wheel?.isMesh, 'physical rotary dial assembly');
    const digits = Array.from({length:10}, (_,i) => scene.getObjectByName(`Retro_Phone_DialNumber_${i}`));
    assert(digits.every(digit => digit?.isMesh), 'all ten printed digits');
    const centers = digits.map(digit => new Box3().setFromObject(digit).getCenter(new Vector3()));
    const {geometry} = plate, positions = geometry.getAttribute('position');
    const normal = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let offset = 0; offset < (geometry.index?.count ?? positions.count); offset += 3) {
      const vertices = [a,b,c].map((point,i) => point.fromBufferAttribute(positions, geometry.index?.getX(offset+i) ?? offset+i).applyMatrix4(plate.matrixWorld));
      const candidate = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
      if (candidate.lengthSq() > normal.lengthSq()) normal.copy(candidate);
    }
    normal.normalize();
    const mean = centers.reduce((sum,center) => sum.add(center), new Vector3()).multiplyScalar(.1);
    if (normal.dot(mean.sub(new Box3().setFromObject(plate).getCenter(new Vector3()))) < 0) normal.negate();
    for (const object of [plate,bezel,wheel]) object.material.side = DoubleSide;
    for (let i = 0; i < centers.length; i++) {
      const ray = new Raycaster(centers[i].clone().addScaledVector(normal,.03),normal.clone().negate(),0,.06);
      const plateHit = ray.intersectObject(plate,false)[0], bezelHit = ray.intersectObject(bezel,false)[0];
      assert(plateHit && bezelHit, `digit ${i}: solid card and recessed support`);
      assert.equal(ray.intersectObject(wheel,false).length,0, `digit ${i}: finger hole remains open`);
      assert(bezelHit.distance-plateHit.distance > .001, `digit ${i}: number plate must clear the bezel rather than z-fight`);
    }
  } finally { dispose(); }
});

test('delivered computer glass and shared native/Canvas anchors describe the same upright 4:3 screen', async () => {
  const {scene, Vector3, dispose} = await decodeDelivered();
  const anchors = JSON.parse(readFileSync(process.env.ROOM_ANCHORS_FILE
    ? resolve(process.env.ROOM_ANCHORS_FILE)
    : new URL('../../src/scripts/room/anchors.json', import.meta.url)));
  try {
    const screen = scene.getObjectByName('Computer_Screen');
    assert(screen?.isMesh, 'delivered computer screen geometry');
    screen.geometry.computeBoundingBox();
    const {min, max} = screen.geometry.boundingBox;
    const corners = anchors.surfaces.about.map(point => new Vector3(...point));
    const local = corners.map(point => screen.worldToLocal(point.clone()));
    const expected = [[min.x,max.y],[max.x,max.y],[max.x,min.y],[min.x,min.y]];
    const scale = screen.getWorldScale(new Vector3());
    for (let i = 0; i < 4; i++) {
      close(local[i].x, expected[i][0], `screen corner ${i}: horizontal alignment`);
      close(local[i].y, expected[i][1], `screen corner ${i}: vertical alignment`);
      close(local[i].z, local[0].z, `screen corner ${i}: coplanar native surface`);
      const clearance = (local[i].z - max.z) * scale.z;
      assert(clearance >= -.0001 && clearance <= .006,
        `screen corner ${i}: overlay must sit on the glass face, not inside or far above it (${clearance} m)`);
    }
    close(corners[0].distanceTo(corners[1]) / corners[0].distanceTo(corners[3]), 4/3, 'native/Canvas screen aspect');
    close((max.x-min.x)*scale.x / ((max.y-min.y)*scale.y), 4/3, 'physical glass aspect');
    const screenNormal = new Vector3(0,0,1).transformDirection(screen.matrixWorld);
    const anchorNormal = corners[3].clone().sub(corners[0]).cross(corners[1].clone().sub(corners[0])).normalize();
    assert(screenNormal.dot(anchorNormal) > .99999, 'native controls and screen face must share orientation');
  } finally { dispose(); }
});

test('delivered keyboard and mouse remain above the desktop with every foot supported', async () => {
  const {scene, Box3, Vector3, dispose} = await decodeDelivered();
  try {
    const desktops = ['Desk_Top','Desk_Return'].map(name => {
      const object = scene.getObjectByName(name);assert(object?.isMesh, `${name}: desktop receiver`);
      return new Box3().setFromObject(object);
    });
    const supports = [];
    scene.traverse(object => {
      if (object.isMesh && /^(Computer_KeyboardFoot|Computer_Mouse_Foot)/.test(object.name)) supports.push(object);
    });
    assert(supports.some(object => object.name.startsWith('Computer_KeyboardFoot')), 'keyboard needs physical feet');
    assert(supports.some(object => object.name.startsWith('Computer_Mouse_Foot')), 'mouse needs physical feet');
    const bodies = ['Computer_Keyboard','Computer_Mouse'].map(name => {
      const object = scene.getObjectByName(name);assert(object?.isMesh, `${name}: input device shell`);return object;
    });
    for (const object of [...bodies,...supports]) {
      const positions = object.geometry.getAttribute('position');
      const points = Array.from({length:positions.count}, (_,i) => new Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld));
      const bottom = Math.min(...points.map(point => point.y));
      let contactPoints = 0;
      for (const point of points) {
        const under = desktops.filter(box => point.x >= box.min.x-.002 && point.x <= box.max.x+.002 && point.z >= box.min.z-.002 && point.z <= box.max.z+.002);
        assert(under.length, `${object.name}: vertex overhangs the desktop at ${point.toArray()}`);
        const top = Math.max(...under.map(box => box.max.y));
        assert(point.y >= top-.001, `${object.name}: geometry penetrates the desktop by ${top-point.y} m`);
        if (supports.includes(object) && point.y <= bottom+.0001) {
          assert(Math.abs(point.y-top) <= .002, `${object.name}: foot must rest on the desktop, gap ${point.y-top} m`);
          contactPoints++;
        }
      }
      if (supports.includes(object)) assert(contactPoints > 0, `${object.name}: tested foot contact vertices`);
    }
  } finally { dispose(); }
});

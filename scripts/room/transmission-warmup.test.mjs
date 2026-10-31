import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Scene,Group,Mesh,BoxGeometry,MeshBasicMaterial,MeshPhysicalMaterial,PerspectiveCamera} from 'three';

let source=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/warmup.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
source=source.replace("from 'three'",`from '${new URL('../../node_modules/three/build/three.module.js',import.meta.url).href}'`);
const {hasVisibleTransmission}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('clearcoat and opacity glass do not request a transmission warmup',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),geometry=new BoxGeometry();
  scene.add(new Mesh(geometry,new MeshPhysicalMaterial({clearcoat:1,ior:1.52})),new Mesh(geometry,new MeshPhysicalMaterial({transparent:true,opacity:.12,ior:1.46})),new Mesh(geometry,new MeshBasicMaterial()));
  assert.equal(hasVisibleTransmission(scene,camera),false);
});

test('an active transmission material requests its warmup, including material arrays',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),glass=new MeshPhysicalMaterial({transmission:.7});
  const mesh=new Mesh(new BoxGeometry(),[new MeshBasicMaterial(),glass]);scene.add(mesh);
  assert.equal(hasVisibleTransmission(scene,camera),true);
  glass.transmission=0;assert.equal(hasVisibleTransmission(scene,camera),false);
});

test('invisible ancestors, material visibility and camera layers exclude unused transmission',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),parent=new Group(),glass=new MeshPhysicalMaterial({transmission:1});
  const mesh=new Mesh(new BoxGeometry(),glass);parent.add(mesh);scene.add(parent);
  parent.visible=false;assert.equal(hasVisibleTransmission(scene,camera),false);
  parent.visible=true;mesh.visible=false;assert.equal(hasVisibleTransmission(scene,camera),false);
  mesh.visible=true;glass.visible=false;assert.equal(hasVisibleTransmission(scene,camera),false);
  glass.visible=true;mesh.layers.set(2);assert.equal(hasVisibleTransmission(scene,camera),false);
  camera.layers.enable(2);assert.equal(hasVisibleTransmission(scene,camera),true);
});

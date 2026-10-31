import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

function load(file){
  const module = { exports: {} };
  const source = readFileSync(new URL(`../../src/scripts/room/${file}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', compiled)(name => name==='three'?three:load(name.slice(2)), module, module.exports);
  return module.exports;
}
const { createDeskDetails } = load('desk-details');

function cup(authored) {
  const root = new three.Group();
  const body = new three.Mesh(new three.CylinderGeometry(.135, .125, .32, 32, 1, true), new three.MeshStandardMaterial());
  body.name = 'Mug_Body'; body.position.set(-.7, .845, .81); body.userData.ceramicInterior = authored;
  const desk=new three.Mesh(new three.BoxGeometry(5,.065,2),new three.MeshStandardMaterial());desk.name='Desk_Top';desk.position.set(0,.6525,0);root.add(desk);
  root.add(body); root.updateMatrixWorld(true);
  const geometry = body.geometry, material = body.material, resources = new Set();
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  let details;
  try { details = createDeskDetails(root, resources); }
  finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
  return { root, body, geometry, material, details, dispose() { for (const resource of resources) resource.dispose(); geometry.dispose(); material.dispose(); } };
}

test('authored hollow stoneware retains its mesh and baked material throughout sipping', () => {
  const c = cup(true), rest = c.body.getWorldPosition(new three.Vector3());
  assert.equal(c.body.geometry, c.geometry); assert.equal(c.body.material, c.material);
  assert(c.details.sip(0)); assert.equal(c.details.sip(.2), false);
  c.details.update(.8, true, .8);
  assert(c.body.getWorldPosition(new three.Vector3()).distanceTo(rest) > .1);
  assert.equal(c.root.getObjectByName('Mug_Body_Contact_Shadow').visible,false,'lifted cup must leave no contact stamp');
  c.details.update(2.1, true, 1.3);
  assert(c.body.getWorldPosition(new three.Vector3()).distanceTo(rest) < 1e-6);
  assert.equal(c.root.getObjectByName('Mug_Body_Contact_Shadow').visible,true);
  assert(Math.abs(c.details.getstate().level - 6 / 7) < 1e-12);
  assert.equal(c.body.geometry, c.geometry); assert.equal(c.body.material, c.material);
  c.dispose();
});

test('reduced-motion sipping drains the liquid without moving the authored cup', () => {
  const c = cup(true), rest = c.body.getWorldPosition(new three.Vector3());
  for (let i = 0; i < 7; i++) assert(c.details.sip(i, undefined, true));
  assert.equal(c.details.sip(8, undefined, true), false);
  c.details.update(8, false, 0);
  assert.equal(c.root.getObjectByName('Coffee_Liquid').visible, false);
  assert(c.body.getWorldPosition(new three.Vector3()).distanceTo(rest) < 1e-6);
  c.dispose();
});

test('older solid-cylinder models still receive a hollow compatibility shell', () => {
  const c = cup(false);
  assert.notEqual(c.body.geometry, c.geometry);
  assert.equal(c.body.geometry.type, 'LatheGeometry');
  c.dispose();
});

test('coffee has an upward facing surface below the ceramic rim, including its meniscus',()=>{
  const c=cup(true),liquid=c.root.getObjectByName('Coffee_Liquid');
  c.root.updateMatrixWorld(true);
  const bounds=new three.Box3().setFromObject(liquid),rim=new three.Box3().setFromObject(c.body);
  assert(bounds.max.y<rim.max.y-.009,'liquid cannot form a lid above the rim');
  const normals=liquid.geometry.attributes.normal;
  for(let i=0;i<normals.count;i++)assert(new three.Vector3().fromBufferAttribute(normals,i).normalize().y>.6,'coffee must face the viewer above the cup');
  assert(bounds.max.y-bounds.min.y>.002,'the edge rises to a meniscus');
  c.dispose();
});

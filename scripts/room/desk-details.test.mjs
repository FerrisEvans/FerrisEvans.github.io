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

function cup(authored, exterior = false, bodyGeometry, pagerContext) {
  const root = new three.Group();
  const body = new three.Mesh(bodyGeometry??new three.CylinderGeometry(.135, .125, .32, 32, 1, true), new three.MeshStandardMaterial());
  body.name = 'Mug_Body'; body.position.set(-.7, .845, .81); body.userData.ceramicInterior = authored;
  const desk=new three.Mesh(new three.BoxGeometry(5,.065,2),new three.MeshStandardMaterial());desk.name='Desk_Top';desk.position.set(0,.6525,0);root.add(desk);
  root.add(body);
  if(pagerContext){const pager=new three.Group();pager.name='Desk_Pager';root.add(pager);}
  let city;
  if(exterior){
    city=new three.Mesh(new three.PlaneGeometry(8,4),new three.MeshBasicMaterial({map:new three.Texture()}));
    city.name='City_Backdrop';city.position.set(.4,2,-5);city.scale.set(1.7,.8,1);root.add(city);
  }
  root.updateMatrixWorld(true);
  const geometry = body.geometry, material = body.material, resources = new Set();
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => pagerContext??null }) };
  let details;
  try { details = createDeskDetails(root, resources); }
  finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
  return { root, body, geometry, material, details, dispose() { for (const resource of resources) resource.dispose(); geometry.dispose(); material.dispose();if(city){city.geometry.dispose();city.material.map.dispose();city.material.dispose();} } };
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
  const positions=liquid.geometry.attributes.position;
  for(let i=0;i<positions.count;i++)if(positions.getY(i)<1e-7)
    assert(normals.getY(i)>.99999,'meniscus normals cannot smear across the flat central liquid');
  assert(bounds.max.y-bounds.min.y>.002,'the edge rises to a meniscus');
  c.dispose();
});

test('the liquid meniscus meets the authored interior instead of the old assumed wall thickness',()=>{
  const profile=[[0,-.16],[.135,-.16],[.135,.16],[.123,.16],[.123,-.14],[0,-.14]].map(([r,y])=>new three.Vector2(r,y));
  const c=cup(true,false,new three.LatheGeometry(profile,96));
  try{
    const liquid=c.root.getObjectByName('Coffee_Liquid'),positions=liquid.geometry.attributes.position;
    let edge=0;
    for(let i=0;i<positions.count;i++)edge=Math.max(edge,Math.hypot(positions.getX(i),positions.getZ(i)));
    assert(.123-edge>0&&.123-edge<.0006,'a thin capillary edge must meet the actual bore without a dry annular gap');
  }finally{c.dispose();}
});

test('liquid reflection reuses the exterior texture and preserves all four transformed plate corners',()=>{
  const c=cup(true,true),city=c.root.getObjectByName('City_Backdrop'),liquid=c.root.getObjectByName('Coffee_Liquid');
  try{
    const shader={uniforms:{},vertexShader:three.ShaderLib.physical.vertexShader,fragmentShader:three.ShaderLib.physical.fragmentShader};
    liquid.material.onBeforeCompile(shader,{});
    assert.equal(shader.uniforms.liquidCity.value,city.material.map,'no duplicate city texture or reflection render target');
    const {position,uv}=city.geometry.attributes;
    for(let i=0;i<position.count;i++){
      const world=city.localToWorld(new three.Vector3().fromBufferAttribute(position,i));
      const plane=new three.Vector3(world.x,world.y,1);
      assert(Math.abs(plane.dot(shader.uniforms.liquidCityU.value)-uv.getX(i))<1e-10);
      assert(Math.abs(plane.dot(shader.uniforms.liquidCityV.value)-uv.getY(i))<1e-10);
      assert.equal(shader.uniforms.liquidCityZ.value,world.z);
    }
  }finally{c.dispose();}
});

test('pager keeps a short message while repeated activation preserves vibration, light decay and reset',()=>{
  const painted=[],context={fillRect(){},fillText(text){painted.push(text);}};
  const c=cup(true,false,undefined,context);
  try{
    assert.deepEqual(painted,['HELLO']);
    assert.equal(c.details.page(10),true);c.details.update(10.1,true,.1);
    assert(c.root.getObjectByName('Desk_Pager').position.length()>0,'message activation still vibrates');
    assert.equal(c.details.getstate().pagerLit,1);
    assert.equal(c.details.page(11),true);assert.equal(c.details.getstate().pages,2);
    assert.deepEqual(painted,['HELLO','NEW MSG','NEW MSG']);
    c.details.update(17,false,5.9);
    assert.equal(c.details.getstate().pagerLit,0);assert.equal(c.root.getObjectByName('Desk_Pager').position.length(),0);
    c.details.reset();assert.equal(c.details.getstate().pages,0);assert.equal(painted.at(-1),'HELLO');
  }finally{c.dispose();}
});

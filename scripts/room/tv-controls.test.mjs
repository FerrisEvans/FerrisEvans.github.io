import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as three from 'three';
const source=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/tv-controls.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(){
  let projections=0;const calls=[];
  class Element{
    children=[];dataset={};style={setProperty(name,value){this[name]=value;}};attributes={};events={};hidden=false;
    append(child){child.parent=this;this.children.push(child);}
    remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
    emit(name,event={}){for(const callback of this.events[name]??[])callback(event);}
    getBoundingClientRect(){return{left:100,top:100,width:1440,height:900};}
  }
  const document={createElement:()=>new Element(),activeElement:null},module={exports:{}};
  new Function('require','module','exports','document',source)(name=>name==='three'?three:{mapPlane(){projections++;}},module,module.exports,document);
  const layer=new Element(),root=new three.Group();
  for(const [index,id]of ['Volume','Tracking','Chroma'].entries()){
    const mesh=new three.Mesh();mesh.name='CRT_Slider_'+id;const y=1.195-index*.06;
    mesh.userData={slider_min_x:.225,slider_max_x:.475,slider_surface:[[.205,y+.022,.315],[.495,y+.022,.315],[.495,y-.022,.315],[.205,y-.022,.315]]};root.add(mesh);
  }
  const controls=module.exports.createTVControls(root,layer,(...args)=>calls.push(args));
  const input=id=>layer.children.find(el=>el.dataset.tvSetting===id),mesh=id=>root.getObjectByName('CRT_Slider_'+id);
  const camera=new three.PerspectiveCamera(30,1.6,.1,100);camera.position.set(0,1.14,3);camera.lookAt(0,1.14,.315);camera.updateMatrixWorld(true);
  return{controls,input,mesh,calls,layer,camera,document,get projections(){return projections;},...module.exports};
}
test('slider endpoints and authored defaults map exactly to physical travel, including 160% chroma',()=>{
  const f=fixture();assert.equal(f.mesh('Volume').position.x,.375);assert.equal(f.mesh('Tracking').position.x,.225);assert.equal(f.mesh('Chroma').position.x,.38125);
  f.controls.set('chroma',1.6);assert.equal(f.mesh('Chroma').position.x,.475);assert.equal(f.input('chroma').value,'1.6');
  f.controls.set('volume',-1);assert.equal(f.mesh('Volume').position.x,.225);f.controls.set('volume',9);assert.equal(f.mesh('Volume').position.x,.475);
  assert.equal(f.clampTVValue('tracking',NaN),0);assert.match(f.tvValueText('chroma',1),/100%.*标准/);
  assert(f.mesh('Volume').userData.roomDynamic&&f.mesh('Volume').userData.keepIndependent);f.controls.dispose();
});
test('drag input updates the physical thumb silently and announces only a committed value',()=>{
  const f=fixture(),input=f.input('volume');input.value='.2';input.emit('input');input.value='.3';input.emit('input');input.emit('change');
  assert.deepEqual(f.calls,[['volume',.2,false],['volume',.3,false],['volume',.3,true]]);assert.equal(f.mesh('Volume').position.x,.3);assert.match(input.attributes['aria-valuetext'],/30%/);
  let stopped=0;input.emit('keydown',{key:'ArrowRight',stopPropagation(){stopped++;}});input.emit('keydown',{key:'Escape',stopPropagation(){stopped++;}});assert.equal(stopped,1);f.controls.dispose();
});
test('hit areas follow camera and resize while static frames are cached; hidden controls and readout cannot linger',()=>{
  const f=fixture();f.controls.project(f.camera,1440,900,true);assert.equal(f.projections,3);assert.equal(f.input('volume').hidden,false);
  f.controls.project(f.camera,1440,900,true);assert.equal(f.projections,3);
  f.controls.project(f.camera,1280,800,true);assert.equal(f.projections,6);
  f.input('volume').emit('pointerenter');assert.equal(f.layer.children[0].hidden,false);
  f.controls.project(f.camera,1280,800,false);assert(f.layer.children.every(el=>el.hidden));f.controls.dispose();assert.equal(f.layer.children.length,0);
});

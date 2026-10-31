import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const compile=name=>ts.transpileModule(readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const source=compile('surfaces'),shape={exports:{}};
new Function('module','exports',compile('paper-shape'))(shape,shape.exports);
const anchors=JSON.parse(readFileSync(new URL('../../src/scripts/room/anchors.json',import.meta.url),'utf8'));

function fixture(){
  let styleWrites=0;
  const projections=[];
  class Element{
    children=[];dataset={};attributes={};hidden=false;
    style=new Proxy({},{set(target,key,value){styleWrites++;target[key]=value;return true;}});
    constructor(tag){this.tag=tag;}
    setAttribute(key,value){this.attributes[key]=value;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    addEventListener(){}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='[data-rect]'?child.dataset.rect:child.tag==='a')?[child]:[],...child.querySelectorAll(selector)]);}
    getContext(){return new Proxy({},{get:()=>()=>{}});}
  }
  const layer=new Element('div'),room=new Element('main');
  const document={createElement:tag=>new Element(tag),querySelector:selector=>selector==='#surface-layer'?layer:room};
  const content={posts:Array.from({length:12},(_,i)=>({title:'文章 '+i,date:'2026-01-01',href:'/posts/'+i})),github:'https://example.com',email:'test@example.com'};
  const tapes=[0,1].map(i=>({id:'tape'+i,label:'TAPE '+i,title:'Tape '+i,description:'Description',href:'/tapes/'+i}));
  const module={exports:{}};
  new Function('require','module','exports','document',source)(name=>({
    three,'./anchors.json':{default:anchors},'./paper-shape':shape.exports,
    './osd':{mapPlane(element,width,height,points){projections.push({element,width,height,points});element.style.transform=JSON.stringify(points);}},
    './content':{pageSize:6,pageInfo:(total,page)=>({page,previous:page>0,next:(page+1)*6<total}),wrapText:(_ctx,text)=>[text]},
    './tapes':{tapes},'./computer':{computerPages:()=>[{title:'First',lines:['one','two']},{title:'Second',lines:['three']}],paintComputer(){}},
  })[name],module,module.exports,document);
  const scene=new three.Scene(),paper=new three.Group(),resources=new Set(),environment=new three.Texture();scene.add(paper);
  const camera=new three.PerspectiveCamera(35,16/9,.1,100);camera.position.set(1.35,2.65,6.65);camera.lookAt(1.3,1.28,.1);camera.updateMatrixWorld(true);
  const noop=()=>{},surfaces=module.exports.createSurfaces(scene,resources,content,{page:noop,tape:noop,paper:noop,navigate:noop,wake:noop},paper,environment);
  const section=view=>layer.children.find(el=>el.className.endsWith('surface-'+view));
  return{surfaces,camera,paper,projections,section,get styleWrites(){return styleWrites;},project:(view='work',w=1440,h=900,enabled=true,raised=true)=>surfaces.project(camera,view,w,h,enabled,raised),dispose(){for(const resource of resources)resource.dispose();environment.dispose();}};
}

test('unchanged surfaces reuse native hit areas without replacing their focusable elements',()=>{
  for(const view of ['work','posts','about','online']){
    const f=fixture();f.project(view);const count=f.projections.length,writes=f.styleWrites,focused=f.section(view).children[0];
    assert(count>0);
    for(let i=0;i<20;i++)f.project(view);
    assert.equal(f.projections.length,count);assert.equal(f.styleWrites,writes);assert.equal(f.section(view).children[0],focused);f.dispose();
  }
});

test('camera, lens, viewport, disabled controls and return navigation invalidate projection',()=>{
  const f=fixture();f.project('posts');let previous=f.projections.at(-1);
  for(const change of [()=>{f.camera.position.x+=.01;f.camera.updateMatrixWorld(true);},()=>{f.camera.fov+=1;f.camera.updateProjectionMatrix();}]){
    change();f.project('posts');assert.notDeepEqual(f.projections.at(-1).points,previous.points);previous=f.projections.at(-1);
  }
  f.project('posts',1200,800);assert.notDeepEqual(f.projections.at(-1).points,previous.points);
  f.project('posts',1200,800,false);assert(f.section('posts').hidden);
  let count=f.projections.length;f.project('posts',1200,800);assert(f.projections.length>count);assert(!f.section('posts').hidden);
  f.project('home');assert(f.section('posts').hidden);count=f.projections.length;
  f.project('posts');assert(f.projections.length>count);assert(!f.section('posts').hidden);f.dispose();
});

test('paper transforms, flex, controls rebuilt by tape selection and lowering remain aligned',()=>{
  const f=fixture();f.project();const initial=f.projections[0].points;
  f.paper.position.x+=.1;let count=f.projections.length;f.project();assert.notDeepEqual(f.projections[count].points,initial);
  const moved=f.projections[count].points;f.paper.userData.flex=.02;count=f.projections.length;f.project();assert.notDeepEqual(f.projections[count].points,moved);
  f.surfaces.selectTape(0);count=f.projections.length;f.project();assert(f.projections.length>count);
  const article=f.section('work').querySelectorAll('a')[0];assert(article.style.transform,'new article link must receive its own hit area');
  f.project('work',1440,900,true,false);assert(f.section('work').hidden);count=f.projections.length;
  f.project();assert(f.projections.length>count);assert(!f.section('work').hidden);f.dispose();
});

test('post pagination, computer page changes and modem completion invalidate cached controls',()=>{
  const f=fixture();f.project('posts');const first=f.section('posts').children[0];f.surfaces.setPage(1);let count=f.projections.length;
  f.project('posts');assert(f.projections.length>count);assert.notEqual(f.section('posts').children[0],first);
  f.project('about');f.surfaces.changeComputerPage(1);count=f.projections.length;f.project('about');assert(f.projections.length>count);
  f.surfaces.setMode('online');f.project('online');assert(f.section('online').hidden);
  f.surfaces.updateComputer(performance.now()/1000+2,true);count=f.projections.length;f.project('online');assert(f.projections.length>count);assert(!f.section('online').hidden);f.dispose();
});

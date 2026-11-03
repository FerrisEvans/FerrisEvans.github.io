import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const compile=name=>ts.transpileModule(readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const source=compile('surfaces'),shape={exports:{}};
new Function('module','exports',compile('paper-shape'))(shape,shape.exports);
const tube={exports:{}},glass={exports:{}};
for(const [name,module]of [['phosphor',tube],['thin-glass',glass]]){
  new Function('require','module','exports',compile(name))(name=>{assert.equal(name,'three');return three;},module,module.exports);
}
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
    three,'./anchors.json':{default:anchors},'./paper-shape':shape.exports,'./phosphor':tube.exports,'./thin-glass':glass.exports,
    './osd':{mapPlane(element,width,height,points){projections.push({element,width,height,points});element.style.transform=JSON.stringify(points);}},
    './content':{pageSize:6,pageInfo:(total,page)=>({page,previous:page>0,next:(page+1)*6<total}),wrapText:(_ctx,text)=>[text]},
    './tapes':{tapes},'./computer':{computerPages:()=>[{title:'First',lines:['one','two']},{title:'Second',lines:['three']}],paintComputer(){}},
  })[name],module,module.exports,document);
  const scene=new three.Scene(),paper=new three.Group(),resources=new Set(),environment=new three.Texture();scene.add(paper);
  const camera=new three.PerspectiveCamera(35,16/9,.1,100);camera.position.set(1.35,2.65,6.65);camera.lookAt(1.3,1.28,.1);camera.updateMatrixWorld(true);
  const navigations=[],noop=()=>{},surfaces=module.exports.createSurfaces(scene,resources,content,{page:noop,tape:noop,paper:noop,navigate:view=>navigations.push(view),wake:noop},paper,environment);
  const section=view=>layer.children.find(el=>el.className.endsWith('surface-'+view));
  return{surfaces,scene,camera,paper,projections,section,navigations,get styleWrites(){return styleWrites;},project:(view='work',w=1440,h=900,enabled=true,raised=true)=>surfaces.project(camera,view,w,h,enabled,raised),dispose(){for(const resource of resources)resource.dispose();environment.dispose();}};
}

test('CRT inner coatings sit behind their curved glass by physical millimetres in transformed frames',()=>{
  const f=fixture();
  try{
    const faceplate=f.scene.getObjectByName('Interface_about'),phosphor=faceplate.children[0];
    assert.equal(faceplate.material.transmission,0,'layering must not allocate a full-scene transmission target');
    assert.equal(faceplate.material.depthWrite,false);
    assert.equal(faceplate.renderOrder,0,'glass must depth-sort with foreground transparent props');
    assert(phosphor.material.emissiveMap,'content stays on the opaque inner coating');
    assert.equal(phosphor.material.specularIntensity,0,'the coating must not duplicate the outer glass reflection');
    assert.equal(phosphor.material.depthWrite,true);
    f.scene.updateMatrixWorld(true);
    const positions=faceplate.geometry.attributes.position,inner=phosphor.geometry.attributes.position;
    const centre=Math.floor(positions.count/2),point=new three.Vector3().fromBufferAttribute(positions,centre).applyMatrix4(faceplate.matrixWorld);
    const back=new three.Vector3().fromBufferAttribute(inner,centre).applyMatrix4(phosphor.matrixWorld);
    const normal=new three.Vector3().fromBufferAttribute(faceplate.geometry.attributes.normal,centre).transformDirection(faceplate.matrixWorld);
    assert(Math.abs(point.distanceTo(back)-.0045)<1e-6);
    assert(point.clone().sub(back).dot(normal)>.00449,'the phosphor lies behind the visible face');
    const ray=new three.Raycaster(point.clone().addScaledVector(normal,.1),normal.clone().negate());
    const hits=ray.intersectObject(faceplate,true);
    assert.equal(hits[0].object,faceplate);assert.equal(hits.at(-1).object,phosphor);
    const transformed=new three.Mesh(new three.PlaneGeometry(.6,.45),new three.MeshPhysicalMaterial());
    transformed.position.set(1,2,3);transformed.rotation.set(.2,1.1,.3);transformed.scale.set(1.7,.8,1.4);f.scene.add(transformed);
    const resources=new Set(),coating=tube.exports.separateTubeLayers(transformed,glass.exports.createThinGlass({roughness:.07}),resources,.006);
    f.scene.updateMatrixWorld(true);
    for(let i=0;i<transformed.geometry.attributes.position.count;i++){
      const front=new three.Vector3().fromBufferAttribute(transformed.geometry.attributes.position,i).applyMatrix4(transformed.matrixWorld);
      const back=new three.Vector3().fromBufferAttribute(coating.geometry.attributes.position,i).applyMatrix4(coating.matrixWorld);
      assert(Math.abs(front.distanceTo(back)-.006)<2e-7,'nonuniform import scale cannot change glass thickness');
    }
    transformed.geometry.dispose();coating.material.dispose();for(const resource of resources)resource.dispose();
  }finally{f.dispose();}
});

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

test('computer headings have no hidden tab targets while paging, real links and terminal routes remain available',()=>{
  const f=fixture();
  try{
    const aboutButtons=()=>f.section('about').children.filter(el=>el.tag==='button');
    assert.deepEqual(aboutButtons().map(el=>el.attributes['aria-label']),['上一页个人介绍','下一页个人介绍']);
    assert(aboutButtons().every(el=>JSON.parse(el.dataset.rect)[1]>=510),'title area must not retain invisible tab hit regions');
    f.surfaces.changeComputerPage(-100);assert.equal(aboutButtons()[0].disabled,true);assert.equal(aboutButtons()[1].disabled,false);
    f.surfaces.changeComputerPage(100);assert.equal(aboutButtons()[0].disabled,false);assert.equal(aboutButtons()[1].disabled,true);
    const links=f.section('online').querySelectorAll('a');
    assert.deepEqual(links.map(el=>el.href),['https://example.com','mailto:test@example.com']);
    assert.equal(links[0].target,'_blank');assert.equal(links[0].rel,'noopener noreferrer');
    assert(!f.section('online').children.some(el=>el.tag==='button'),'Online retains links without duplicate navigation buttons');
    f.surfaces.computerKey('q');
    assert.deepEqual(aboutButtons().map(el=>el.attributes['aria-label']),['打开 ABOUT.TXT','打开 ONLINE.BBS']);
    f.surfaces.computerKey('1');f.surfaces.computerKey('q');f.surfaces.computerKey('2');
    assert.deepEqual(f.navigations,['about','online']);
  }finally{f.dispose();}
});

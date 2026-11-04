import {
  AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, ShadowMaterial, OrthographicCamera, PCFShadowMap, PlaneGeometry,
  Scene, SRGBColorSpace, ACESFilmicToneMapping, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createNavigation } from './navigation';
import { createAnimation } from './animation';
import { createEffects } from './effects';
import { createActivity } from './activity';
import { createOutline } from './outline';
import { createPicker } from './picking';
import { viewObjects, hoverObjects, type IslandView, type HoverTarget } from './types';
import { releaseObjectResources } from './resources';

export async function createIsland(host: HTMLElement, bytes: ArrayBuffer, invalidate: () => void, failed: () => void, signal: AbortSignal) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
  const scene = new Scene();
  const camera = new OrthographicCamera(-8, 8, 5, -5, .1, 100);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);
  const lost = (event: Event) => { event.preventDefault(); failed(); };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  let disposed = false;
  const cleanupHooks: (() => void)[] = [];
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    signal.removeEventListener('abort', onAbort);
    cleanupHooks.forEach(cleanup => cleanup());
    releaseObjectResources(scene);
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  let rejectAbort: (error: DOMException) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  function onAbort() { dispose(); rejectAbort(new DOMException('Aborted', 'AbortError')); }
  signal.addEventListener('abort', onAbort, { once: true });
  try {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let model: Group;
  let clips: import('three').AnimationClip[] = [];
  try {
    const parsed = new GLTFLoader().parseAsync(bytes, '/island/').then(gltf => {
      // Parsing has no AbortSignal API. A result arriving after navigation must
      // still release its decoded textures rather than outlive the abandoned page.
      if (disposed || signal.aborted) { releaseObjectResources(gltf.scene); throw new DOMException('Aborted', 'AbortError'); }
      return gltf;
    });
    const gltf = await Promise.race([parsed, aborted]); model = gltf.scene; clips = gltf.animations;
  }
  catch (error) { throw error; }
  scene.add(model);
  if (new URLSearchParams(location.search).has('greybox')) scene.overrideMaterial = new MeshStandardMaterial({ color: '#b5bbb0', roughness: 1 });
  cleanupHooks.push(() => scene.overrideMaterial?.dispose());
  model.traverse(object => {
    if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  const floorMaterial = new ShadowMaterial({ color: '#68735f', opacity: .14 });
  const floor = new Mesh(new PlaneGeometry(200, 200), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = new Box3().setFromObject(model).min.y - .025;
  floor.receiveShadow = true;
  scene.add(floor);
  const ambient = new AmbientLight('#fff1db', .6);
  const sky = new HemisphereLight('#e7f6ff', '#af9676', 2.2);
  const sun = new DirectionalLight('#fff1d3', 2.8);
  sun.position.set(-6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 35 });
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 6;
  sun.shadow.intensity = .75;
  const fill = new DirectionalLight('#e1f9ec', .7);
  fill.position.set(7, 6, -5);
  scene.add(ambient, sky, sun, fill);
  cleanupHooks.push(() => sun.shadow.map?.dispose());
  const anchors = new Map<IslandView, Vector3>();
  for (const [view, name] of Object.entries(viewObjects)) {
    const object = model.getObjectByName(name);
    if (object) anchors.set(view as IslandView, new Box3().setFromObject(object).getCenter(new Vector3()));
  }
  // The full-viewport scene owns drag, pinch and wheel gestures.
  renderer.domElement.style.touchAction = 'none';
  const navigation = createNavigation(camera, host, anchors, model);
  const animation = createAnimation(model, clips);
  const effects = createEffects(model, scene, camera);
  const activity = createActivity(model, scene);
  const outline = createOutline(renderer, scene, camera);
  cleanupHooks.push(() => navigation.dispose(), () => animation.dispose(), () => outline.dispose());
  const picker = createPicker(model, camera, host);
  navigation.controls.addEventListener('change', invalidate);
  let highlighted: HoverTarget | null = null;
  const originalMaterials = new Set<MeshStandardMaterial>();
  model.traverse(object => {
    if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) originalMaterials.add(material);
    }
  });
  function hover(view: HoverTarget | null) {
    if (highlighted === view) return;
    highlighted = view;
    outline.select(view ? model.getObjectByName(hoverObjects[view]) ?? null : null);
    animation.hover(view); effects.hover(view); activity.hover(view); invalidate();
  }
  function theme(dark: boolean) {
    scene.background = new Color(dark ? '#303b32' : '#f8f8f0');
    floorMaterial.color.set(dark ? '#101e18' : '#68735f');
    floorMaterial.opacity = dark ? .3 : .14;
    sky.intensity = dark ? 1.15 : 2.2;
    sky.color.set(dark ? '#a9c8d9' : '#e7f6ff');
    ambient.intensity = dark ? .35 : .6;
    sun.intensity = dark ? 1.7 : 2.8;
    sun.color.set(dark ? '#b9d5ee' : '#fff1d3');
    fill.intensity = dark ? .35 : .7;
    for (const material of originalMaterials) {
      if (/window|glow|lamp/i.test(material.name)) {
        material.emissive.set('#ffd596'); material.emissiveIntensity = dark ? 1.5 : .05;
      }
    }
    outline.theme(dark);
    invalidate();
  }
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    // Match actual DPR; never force extra supersampling on a DPR-1 device.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 2));
    renderer.setSize(width, height, false);
    outline.resize(width, height, renderer.getPixelRatio());
    navigation.resize(width, height); invalidate();
  }
  resize(); theme(document.documentElement.classList.contains('dark'));
  await Promise.race([renderer.compileAsync(scene, camera), aborted]);
  await Promise.race([Promise.resolve(outline.warmup()), aborted]);
  return {
    canvas: renderer.domElement, anchors,
    pick: picker.pick, hover, theme, resize,
    navigate(view: IslandView | null, reduced: boolean, time: number) { navigation.go(view, reduced); animation.activate(view, time); invalidate(); },
    render(time: number, dt: number, reduced: boolean) {
      if (disposed) return;
      navigation.update(dt); animation.update(time, dt, reduced); effects.update(time, dt, reduced); activity.update(time, dt, reduced);
      outline.update(dt, reduced); outline.render();
    },
    get moving() { return navigation.moving; },
    project(view: IslandView) {
      const point = anchors.get(view)?.clone();
      if (!point) return null;
      point.y += view === 'about' ? 1.2 : .65;
      point.project(camera);
      return { x: (point.x + 1) / 2 * host.clientWidth, y: (1 - point.y) / 2 * host.clientHeight };
    },
    metrics() { return { animation: animation.state(), poses: animation.poses(), effects: effects.state(), activity: activity.state(), outline: outline.state(), calls: outline.state().calls, triangles: outline.state().triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, dpr: renderer.getPixelRatio(), width: renderer.domElement.width, height: renderer.domElement.height }; },
    dispose,

  };
  } catch (error) { dispose(); throw error; }
}

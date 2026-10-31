import {
  AgXToneMapping,
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyMaterialStudy, type Channel } from './lighting';
import { loadRoomModel } from './model';

/** Fixed-camera studies; the accepted greybox remains available via ?study=greybox. */
export async function mountGreybox() {
  const room = document.querySelector<HTMLElement>('#room')!;
  const host = document.querySelector<HTMLElement>('#scene')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const guides = document.querySelector<HTMLElement>('#guides')!;
  const toggle = document.querySelector<HTMLButtonElement>('#toggle-guides')!;
  const channelSelect = document.querySelector<HTMLSelectElement>('#tv-channel')!;
  const greybox = new URLSearchParams(location.search).get('study') === 'greybox';
  let lighting: Awaited<ReturnType<typeof applyMaterialStudy>> | undefined;
  if (greybox) {
    channelSelect.hidden = true;
    document.querySelector('.stage')!.textContent = 'STUDY / 02';
    document.querySelector('.detail')!.textContent = '灰盒基准：只检查物体比例、位置和固定主镜头。';
  }

  function fallback(message: string) {
    room.dataset.state = 'fallback';
    status.textContent = message;
    toggle.disabled = true;
    channelSelect.disabled = true;
    guides.hidden = true;
  }

  // Keep the established reading experience on phones, including with JS disabled.
  if (window.matchMedia('(max-width: 700px)').matches) {
    fallback('手机请使用 LO-FI 阅读博客，完整保留现有文章与搜索。');
    return;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) {
    fallback('此浏览器无法启用 WebGL 2，请使用 LO-FI 阅读博客。');
    return;
  }

  const renderer = new WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = greybox ? ACESFilmicToneMapping : AgXToneMapping;
  renderer.toneMappingExposure = 1;
  host.append(canvas);

  const scene = new Scene();
  scene.background = new Color('#777a7e');
  if (greybox) {
  scene.add(new HemisphereLight(0xffffff, 0x565859, 2));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.6);
  fill.position.set(3, 2, -1);
  scene.add(fill);
  }

  let camera: PerspectiveCamera | undefined;
  let horizontalHalfFov = 0;
  let disposed = false;
  const resources = new Set<{ dispose(): void }>();
  function render() {
    if (!camera || disposed || document.hidden) return;
    const { width, height } = host.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Match Blender's horizontal sensor fit, including laptop and wide viewports.
    camera.fov = 2 * Math.atan(horizontalHalfFov / camera.aspect) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    room.dataset.triangles = String(renderer.info.render.triangles);
    room.dataset.drawCalls = String(renderer.info.render.calls);
  }

  function toggleGuides() {
    guides.hidden = !guides.hidden;
    toggle.setAttribute('aria-pressed', String(!guides.hidden));
    toggle.textContent = guides.hidden ? '显示参考框' : '隐藏参考框';
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && !guides.hidden) toggleGuides();
  }
  function changeChannel() {
    room.dataset.tvLinear = lighting?.setChannel(channelSelect.value as Channel)?.join(',');
    room.dataset.channel = channelSelect.value;
    render();
  }
  const observer = new ResizeObserver(render);
  observer.observe(host);
  toggle.addEventListener('click', toggleGuides);
  channelSelect.addEventListener('change', changeChannel);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', render);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    fallback('图形上下文已丢失。请刷新预览，或使用 LO-FI 阅读博客。');
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    toggle.removeEventListener('click', toggleGuides);
    channelSelect.removeEventListener('change', changeChannel);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', render);
    for (const resource of resources) resource.dispose();
    renderer.dispose();
  }
  window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { once: true });

  try {
    const gltf = greybox ? await new GLTFLoader().loadAsync('/room/greybox.glb') : await loadRoomModel();
    if (!greybox) {
      status.textContent = '加载材质与分层照明…';
      lighting = await applyMaterialStudy(gltf.scene, resources, renderer);
    }
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
      }
    });
    if (disposed) {
      for (const resource of resources) resource.dispose();
      return;
    }
    const exportedCamera = gltf.cameras.find((item) => item.name === 'HomeCamera');
    if (!(exportedCamera instanceof PerspectiveCamera)) throw new Error('Missing exported HomeCamera');
    camera = exportedCamera;
    horizontalHalfFov = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    scene.add(gltf.scene);
    scene.updateMatrixWorld(true);
    render();
    room.dataset.state = 'ready';
    room.dataset.camera = camera.name;
    toggle.disabled = false;
    channelSelect.disabled = greybox;
    room.dataset.quality = lighting?.quality ?? 'greybox';
    room.dataset.reflections = greybox ? 'none' : 'scene-probe';
    changeChannel();
    status.textContent = greybox ? '灰盒已就绪 · 固定主镜头' : '材质已就绪 · 台灯与电视分层照明';
  } catch (error) {
    console.error('Room preview could not load', error);
    dispose();
    fallback('场景加载失败。你仍可进入 LO-FI 阅读现有博客。');
  }
}

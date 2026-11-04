import {
  Color, HalfFloatType, NoBlending, NoToneMapping, NormalBlending, Vector2,
  WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Keep the beauty render on its normal path. Putting it through OutputPass
 * would tone-map the flat background and alter transparent shadow blending.
 * Only OutlinePass's depth-tested silhouette goes through a transparent target
 * and OutputPass (sRGB conversion, no second tone mapping).
 *
 * Official passes: https://threejs.org/docs/pages/OutlinePass.html
 * https://threejs.org/docs/pages/OutputPass.html
 */
export function createOutline(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const size = renderer.getSize(new Vector2());
  let width = size.x, height = size.y, pixelRatio = renderer.getPixelRatio();
  let desired: Object3D | null = null, shown: Object3D | null = null;
  let progress = 0, dark = false, disposed = false, prepared = false;
  let calls = 0, triangles = 0, postprocessing = false;
  let resources: ReturnType<typeof allocate> | undefined;
  const ink = new Color('#89694f');
  const savedClear = new Color();
  const opacity = () => progress * progress * (3 - 2 * progress) * .86;

  function allocate() {
    const pass = new OutlinePass(new Vector2(1, 1), scene, camera);
    // The RGB channel encodes only visible edges. Hidden-edge alpha in the
    // stock shader is nonzero even with black hiddenEdgeColor, so do not use it.
    pass.visibleEdgeColor.set(0xffffff);
    pass.hiddenEdgeColor.set(0x000000);
    pass.edgeGlow = 0;
    pass.pulsePeriod = 0;
    pass.usePatternTexture = false;
    pass.edgeThickness = .65;
    pass.edgeStrength = 2.8;
    pass.overlayMaterial.uniforms.ink = { value: ink };
    pass.overlayMaterial.uniforms.fade = { value: 0 };
    pass.overlayMaterial.fragmentShader = /* glsl */`
      varying vec2 vUv;
      uniform sampler2D maskTexture;
      uniform sampler2D edgeTexture1;
      uniform float edgeStrength;
      uniform vec3 ink;
      uniform float fade;
      void main() {
        float edge = texture2D(edgeTexture1, vUv).r;
        float outside = texture2D(maskTexture, vUv).r;
        // No object fill and no occluded outlines. Store straight alpha for
        // the final normal-blended pass, rather than additive glow.
        gl_FragColor = vec4(ink, clamp(edge * outside * edgeStrength, 0.0, 1.0) * fade);
      }`;
    pass.overlayMaterial.blending = NoBlending;
    pass.overlayMaterial.transparent = false;
    const edges = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    edges.texture.name = 'Island.visibleOutline';
    const output = new OutputPass();
    output.renderToScreen = true;
    output.material.transparent = true;
    output.material.blending = NormalBlending;
    output.material.depthTest = false;
    output.material.depthWrite = false;
    const value = { pass, edges, output };
    resizeResources(value);
    return value;
  }

  function resizeResources(value: { pass: OutlinePass; edges: WebGLRenderTarget }) {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    // Detect at CSS-pixel resolution so a DPR-2 display does not halve the
    // apparent stroke. The mask/depth buffers retain full device resolution.
    value.pass.downSampleRatio = Math.max(1, pixelRatio);
    value.pass.setSize(w, h);
    value.edges.setSize(w, h);
  }

  function drawEdges(object: Object3D, fade: number) {
    const value = resources ??= allocate();
    const autoClear = renderer.autoClear, toneMapping = renderer.toneMapping;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate, shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const target = renderer.getRenderTarget(), clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(savedClear);
    try {
      // Mask passes must not regenerate the scene's shadow map while parts of
      // the scene are temporarily hidden by the official OutlinePass.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      value.pass.selectedObjects = [object];
      value.pass.overlayMaterial.uniforms.fade.value = fade;
      renderer.setRenderTarget(value.edges);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      value.pass.render(renderer, value.edges, value.edges, 0, false);
      renderer.autoClear = false;
      renderer.toneMapping = NoToneMapping;
      value.output.render(renderer, value.edges, value.edges, 0, false);
    } finally {
      renderer.toneMapping = toneMapping;
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setClearColor(savedClear, clearAlpha);
      renderer.setRenderTarget(target);
    }
  }

  return {
    select(object: Object3D | null) { if (!disposed) desired = object; },
    update(dt: number, reduced: boolean) {
      if (disposed) return;
      if (reduced) { shown = desired; progress = desired ? 1 : 0; return; }
      const step = Math.max(0, Math.min(dt, .1));
      if (shown !== desired) {
        progress = Math.max(0, progress - step / .09);
        if (progress === 0) shown = desired;
      }
      if (shown === desired) progress = Math.min(1, Math.max(0, progress + (desired ? step / .16 : -step / .09)));
    },
    theme(value: boolean) { dark = value; ink.set(dark ? '#e0e4c8' : '#89694f'); },
    resize(w: number, h: number, dpr: number) {
      width = Math.max(1, w); height = Math.max(1, h); pixelRatio = Math.max(1, dpr);
      if (resources) resizeResources(resources);
    },
    /** Call during loading, after scene resize/lighting setup. No RAF or extra
     * scene objects survive warmup, and it leaves the visible frame unchanged. */
    async warmup() {
      if (disposed || prepared) return;
      await renderer.compileAsync(scene, camera);
      if (disposed) return;
      let example: Object3D | undefined;
      scene.traverseVisible(object => { if (!example && (object as Object3D & { isMesh?: boolean }).isMesh) example = object; });
      if (!example) return;
      renderer.render(scene, camera);
      drawEdges(example, 0);
      prepared = true;
    },
    render() {
      if (disposed) return;
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      try {
        renderer.render(scene, camera);
        postprocessing = Boolean(shown && progress > 0);
        if (postprocessing && shown) drawEdges(shown, opacity());
        calls = renderer.info.render.calls;
        triangles = renderer.info.render.triangles;
      } finally { renderer.info.autoReset = autoReset; }
    },
    state() {
      return { active: Boolean(desired), selected: desired?.name ?? null, drawn: shown?.name ?? null,
        opacity: opacity(), postprocessing, calls, triangles, prepared, dark };
    },
    dispose() {
      if (disposed) return;
      disposed = true; desired = shown = null; progress = 0; postprocessing = false;
      if (resources) {
        resources.pass.selectedObjects = [];
        resources.pass.dispose(); resources.output.dispose(); resources.edges.dispose();
        resources = undefined;
      }
    },
  };
}

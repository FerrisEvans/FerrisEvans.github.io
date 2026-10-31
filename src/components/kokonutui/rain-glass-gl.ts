export const WATER_SCALE = 0.75;
export const FOG_SCALE = 0.5;
export const MAX_DROPS = 140;
export const RUN_AT = 7.5;
export const FOG_BACK = 9;
export const FOG_STEP = 0.25;
export const FOG = 0.6;
export const WIPE_WIDTH = 64;

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uWater;
uniform sampler2D uClear;
uniform vec4 uCover;
uniform vec2 uRes;
uniform vec3 uFog;
uniform float uFogAmount;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float mist(vec2 px, out vec2 normal) {
  vec2 cell = floor(px / 7.0);
  if (hash(cell + 7.7).x > 0.55) {
    normal = vec2(0.0);
    return 0.0;
  }
  vec2 h = hash(cell);
  vec2 center = (cell + 0.2 + 0.6 * h) * 7.0;
  float r = 0.6 + 1.7 * pow(hash(cell + 3.1).x, 3.0);
  vec2 d = (px - center) / r;
  normal = d;
  return sqrt(max(0.0, 1.0 - dot(d, d)));
}

vec3 scene(vec2 uv, float lod) {
  return textureLod(uScene, uv * uCover.xy + uCover.zw, lod).rgb;
}

float shine(vec2 n, float thick) {
  vec3 l = normalize(vec3(-0.45, 0.55, 0.7));
  return pow(max(dot(normalize(vec3(n.x, -n.y, thick + 0.15)), l), 0.0), 36.0);
}

void main() {
  vec2 uv = vUv;
  vec4 w = texture(uWater, uv);
  vec2 n = w.rg * 2.0 - 1.0;
  float thick = w.b;
  float clear = texture(uClear, uv).r;

  vec3 soft = mix(scene(uv, 5.0), uFog, uFogAmount);
  vec3 glass = mix(soft, scene(uv, 0.6), clear);

  vec2 aspect = vec2(uRes.y / uRes.x, 1.0);
  vec2 bent = uv + vec2(-n.x, n.y) * aspect * 0.07 * (0.5 + thick);
  vec3 drop = mix(scene(bent, 0.4), soft, 0.18);
  drop *= mix(0.8, 1.05, smoothstep(0.0, 0.6, thick));
  drop += shine(n, thick) * 0.55;
  float a = smoothstep(0.02, 0.18, thick);
  vec3 col = mix(glass, drop, a);

  vec2 mn;
  float m = mist(vec2(uv.x, 1.0 - uv.y) * uRes, mn) * (1.0 - clear);
  vec3 bead = mix(glass, scene(uv - mn * 0.004, 1.0), 0.5);
  bead = bead * mix(0.92, 1.06, m) + shine(mn, m) * 0.35;
  col = mix(col, bead, smoothstep(0.05, 0.4, m) * (1.0 - a) * 0.75);

  o = vec4(col, 1.0);
}`;

export interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  trail: number;
}

export interface Pane {
  resize: (w: number, h: number, cssW: number, cssH: number) => void;
  setScene: (image: HTMLImageElement, cssW: number, cssH: number) => void;
  setCover: (cssW: number, cssH: number) => void;
  setFog: (rgb: number[], amount: number) => void;
  upload: (water: HTMLCanvasElement, clear: HTMLCanvasElement) => void;
  draw: () => void;
  destroy: () => void;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function toRgb(color: string, probe: CanvasRenderingContext2D) {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function dropSprite() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      const edge = Math.min(1, Math.max(0, (1 - d) / 0.12));
      image.data[i] = 128 + dx * 127;
      image.data[i + 1] = 128 + dy * 127;
      image.data[i + 2] = Math.sqrt(Math.max(0, 1 - d * d)) * 255;
      image.data[i + 3] = edge * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function texture(gl: WebGL2RenderingContext, unit: number) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([128, 128, 0, 255])
  );
  return tex;
}

export function createPane(gl: WebGL2RenderingContext): Pane | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!(vertex && fragment && program)) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  const at = (name: string) => gl.getUniformLocation(program, name);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const sceneTex = texture(gl, 0);
  const waterTex = texture(gl, 1);
  const clearTex = texture(gl, 2);
  let imageAspect = 1;

  gl.useProgram(program);
  gl.uniform1i(at("uScene"), 0);
  gl.uniform1i(at("uWater"), 1);
  gl.uniform1i(at("uClear"), 2);
  gl.uniform4f(at("uCover"), 1, 1, 0, 0);

  const setCover = (cssW: number, cssH: number) => {
    const ratio = cssW / cssH / imageAspect;
    const sx = ratio > 1 ? 1 : ratio;
    const sy = ratio > 1 ? 1 / ratio : 1;
    gl.uniform4f(at("uCover"), sx, sy, 0.5 - sx / 2, 0.5 - sy / 2);
  };

  return {
    resize: (w, h, cssW, cssH) => {
      gl.viewport(0, 0, w, h);
      gl.uniform2f(at("uRes"), cssW, cssH);
    },
    setScene: (image, cssW, cssH) => {
      imageAspect = image.naturalWidth / image.naturalHeight;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      setCover(cssW, cssH);
    },
    setCover,
    setFog: (rgb, amount) => {
      gl.uniform3f(at("uFog"), rgb[0], rgb[1], rgb[2]);
      gl.uniform1f(at("uFogAmount"), amount);
    },
    upload: (water, clear) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, waterTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, water);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, clearTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, clear);
    },
    draw: () => {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy: () => {
      gl.deleteTexture(sceneTex);
      gl.deleteTexture(waterTex);
      gl.deleteTexture(clearTex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

export function rainDrop(width: number, height: number): Drop {
  return {
    x: Math.random() * width,
    y: Math.random() * height * 0.95,
    r: 2.5 + Math.random() ** 2 * 6,
    vy: 0,
    drift: (Math.random() - 0.5) * 0.6,
    trail: 0,
  };
}

function swallow(d: Drop, drops: Drop[]) {
  for (const other of drops) {
    if (other === d || other.r <= 0) continue;
    const reach = (d.r + other.r) * 0.8;
    if (
      Math.abs(other.x - d.x) < reach &&
      Math.abs(other.y - d.y) < reach &&
      Math.hypot(other.x - d.x, other.y - d.y) < reach
    ) {
      d.r = Math.min(16, Math.hypot(d.r, other.r * 0.9));
      other.r = 0;
    }
  }
}

export function stepDrops(
  drops: Drop[],
  dt: number,
  height: number,
  clear: CanvasRenderingContext2D
) {
  const fresh: Drop[] = [];
  for (const d of drops) {
    if (d.r < RUN_AT) continue;
    const pull = 140 + d.r * 22;
    d.vy += (pull - d.vy) * Math.min(1, dt * (Math.random() < 0.06 ? 0.4 : 3));
    const dy = d.vy * dt;
    d.y += dy;
    d.x += d.drift * dy * 0.25 + (Math.random() - 0.5) * 0.4;
    d.trail += dy;
    clear.beginPath();
    clear.arc(d.x * FOG_SCALE, d.y * FOG_SCALE, d.r * 0.7 * FOG_SCALE, 0, 7);
    clear.fill();
    if (d.trail > d.r * 3) {
      d.trail = -Math.random() * d.r * 4;
      d.r *= 0.985;
      fresh.push({
        x: d.x + (Math.random() - 0.5) * 2,
        y: d.y - d.r * 1.2,
        r: d.r * (0.14 + Math.random() * 0.14),
        vy: 0,
        drift: 0,
        trail: 0,
      });
    }
    swallow(d, drops);
    if (d.y - d.r > height) d.r = 0;
  }
  return fresh;
}

export function paintWater(
  ctx: CanvasRenderingContext2D,
  drops: Drop[],
  sprite: HTMLCanvasElement,
  width: number,
  height: number
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgb(128, 128, 0)";
  ctx.fillRect(0, 0, width * WATER_SCALE, height * WATER_SCALE);
  ctx.setTransform(WATER_SCALE, 0, 0, WATER_SCALE, 0, 0);
  for (const d of drops) {
    const tall = d.vy > 20 ? 1.25 : 1;
    ctx.drawImage(sprite, d.x - d.r, d.y - d.r * tall, d.r * 2, d.r * 2 * tall);
  }
}

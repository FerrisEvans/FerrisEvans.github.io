import tapeData from '../../data/room-tapes.json';

type TapeKind = 'pointer' | 'array' | 'string' | 'reference' | 'stack' | 'linked-list' | 'scene-tree' | 'transform' | 'delta' | 'code' | 'rag' | 'pixel-game';
export type Tape = { id: string; object: string; title: string; label: string; description: string; href: string; kind: TapeKind };
export const tapes = tapeData as Tape[];

type Context = CanvasRenderingContext2D;
type Point = [number, number];
const paper = '#ecf0dc', muted = '#9caeab';
const face = 'RoomPixel, RoomPixelZH, monospace';
const chinese = 'RoomPixelZH, "PingFang SC", sans-serif';
const palettes: Record<TapeKind, [string, string]> = {
  pointer: ['#142c48', '#81c8e8'], array: ['#303325', '#ddc46e'], string: ['#153b36', '#85d9b9'],
  reference: ['#342a42', '#c2a3df'], stack: ['#3c2c20', '#e7b46f'], 'linked-list': ['#1e3540', '#83cdd1'],
  'scene-tree': ['#253047', '#a7c7f1'], transform: ['#27392f', '#a5d295'], delta: ['#1b303e', '#e4cc7e'],
  code: ['#17322b', '#a1d7b1'], rag: ['#2b2d49', '#b7aff0'], 'pixel-game': ['#192940', '#d7b77e'],
};
const clamp = (n: number) => Math.max(0, Math.min(n, 1));
const mod = (n: number, d: number) => ((n % d) + d) % d;
const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function text(ctx: Context, value: string, x: number, y: number, size = 28, color = paper, align: CanvasTextAlign = 'left', zh = false) {
  ctx.font = `${size}px ${zh ? chinese : face}`; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function line(ctx: Context, points: Point[], color: string, width = 2, dashed = false) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [7, 7] : []);
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
}
function arrow(ctx: Context, points: Point[], color: string, width = 3) {
  line(ctx, points, color, width);
  const [x, y] = points[points.length - 1], [px, py] = points[points.length - 2];
  const a = Math.atan2(y - py, x - px), r = 10;
  line(ctx, [[x - Math.cos(a - .5) * r, y - Math.sin(a - .5) * r], [x, y], [x - Math.cos(a + .5) * r, y - Math.sin(a + .5) * r]], color, width);
}
function box(ctx: Context, x: number, y: number, w: number, h: number, color: string, fill = '#08111870') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
}
function dot(ctx: Context, x: number, y: number, color: string, r = 5) {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
}
function pulse(ctx: Context, points: Point[], progress: number, color: string) {
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let distance = lengths.reduce((sum, length) => sum + length, 0) * clamp(progress);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const p = lengths[i] ? distance / lengths[i] : 0;
      dot(ctx, lerp(points[i][0], points[i + 1][0], p), lerp(points[i][1], points[i + 1][1], p), color);
      return;
    }
    distance -= lengths[i];
  }
}
function grid(ctx: Context, x: number, y: number, w: number, h: number, gap = 24, color = '#ffffff0c') {
  for (let col = x; col <= x + w; col += gap) line(ctx, [[col, y], [col, y + h]], color, 1);
  for (let row = y; row <= y + h; row += gap) line(ctx, [[x, row], [x + w, row]], color, 1);
}
function footer(ctx: Context, line1: string, line2 = '') {
  text(ctx, line1, 48, 457, 24, paper, 'left', true);
  if (line2) text(ctx, line2, 48, 491, 24, muted);
}

function pointer(ctx: Context, time: number, accent: string) {
  const p = mod(time, 6) / 6;
  text(ctx, 'POINTER VARIABLE', 54, 165, 25, accent);
  box(ctx, 54, 190, 224, 100, accent); text(ctx, 'p = 0x1040', 166, 249, 38, paper, 'center');
  text(ctx, 'MEMORY / int value = 42', 392, 151, 25, accent);
  for (let i = 0; i < 4; i++) {
    const y = 176 + i * 51, selected = i === 1;
    box(ctx, 394, y, 282, 48, selected ? accent : '#68808e', selected ? '#71bdd422' : '#08111870');
    text(ctx, `0x${(0x103c + i * 4).toString(16).toUpperCase()}`, 410, y + 32, 26, selected ? paper : muted);
    text(ctx, selected ? '42' : '··', 644, y + 33, 31, selected ? '#ffe0a3' : muted, 'right');
  }
  const route: Point[] = [[278, 240], [334, 240], [334, 251], [390, 251]];
  arrow(ctx, route, accent); pulse(ctx, route, smooth(p * 2), '#f5df9e');
  text(ctx, '*p', 323, 216, 31, accent);
  text(ctx, p < .5 ? 'READ ADDRESS' : 'DEREFERENCE → 42', 54, 378, 32, p < .5 ? accent : '#ffe0a3');
  footer(ctx, '指针保存地址；解引用读取该地址上的对象。', 'int *p = &value;    *p == 42');
}

function array(ctx: Context, time: number, accent: string) {
  const values = [3, 8, 13, 21, 34, 55], n = Math.floor(mod(time, 9) / 1.5);
  text(ctx, 'CONTIGUOUS MEMORY', 48, 155, 28, accent);
  for (let i = 0; i < 6; i++) {
    const x = 58 + i * 108, selected = i === n;
    text(ctx, `[${i}]`, x + 48, 203, 28, selected ? paper : muted, 'center');
    box(ctx, x, 221, 96, 94, selected ? accent : '#777960', selected ? '#e2c86824' : '#10140c70');
    text(ctx, String(values[i]), x + 48, 280, 48, paper, 'center');
    text(ctx, `+${i * 4} B`, x + 48, 345, 24, selected ? accent : muted, 'center');
  }
  const x = 106 + n * 108;
  arrow(ctx, [[x, 394], [x, 354]], accent); text(ctx, `p + ${n}`, x, 416, 30, accent, 'center');
  footer(ctx, '每次跨过一个元素；示例中 int 占 4 字节。', `*(p + ${n}) == a[${n}] == ${values[n]}`);
}

function stringScan(ctx: Context, time: number, accent: string) {
  const step = Math.floor(mod(time, 8)), n = Math.min(step, 6), done = step >= 6;
  const chars = ['F', 'E', 'R', 'R', 'I', 'S', '\\0'];
  text(ctx, 'char name[] = "FERRIS";', 48, 162, 34, accent);
  chars.forEach((char, i) => {
    const x = 48 + i * 96;
    box(ctx, x, 215, 84, 94, i === n ? accent : '#52796d', i < n ? '#80c6a820' : '#081b1770');
    text(ctx, char, x + 42, 276, i === 6 ? 34 : 48, i === 6 ? '#ecd58a' : paper, 'center');
    text(ctx, `0${i}`, x + 42, 337, 25, muted, 'center');
  });
  arrow(ctx, [[90 + n * 96, 184], [90 + n * 96, 209]], accent);
  text(ctx, done ? 'STOP / NULL CHARACTER' : `SCAN / CHARACTER ${n + 1}`, 48, 398, 34, done ? '#ecd58a' : accent);
  footer(ctx, done ? 'strlen(name) 为 6；存储空间包含末尾的空字符。' : '逐个读取字符，直到发现结束标记。', `sizeof(name) = 7 bytes   |   ${done ? 'length = 6' : `count = ${n}`}`);
}

function reference(ctx: Context, time: number, accent: string) {
  const changed = mod(time, 8) >= 4, value = changed ? 11 : 10;
  text(ctx, 'int x = 10;     int &r = x;', 48, 154, 33, accent);
  box(ctx, 64, 198, 164, 72, accent); text(ctx, 'x', 146, 247, 48, paper, 'center');
  box(ctx, 64, 316, 164, 72, accent); text(ctx, 'r', 146, 365, 48, paper, 'center');
  arrow(ctx, [[232, 234], [322, 234], [322, 279], [434, 279]], '#b7c6da');
  arrow(ctx, [[232, 352], [352, 352], [352, 309], [434, 309]], changed ? '#ecd58a' : accent);
  box(ctx, 440, 215, 224, 158, accent, '#bfa4de16');
  text(ctx, 'ONE OBJECT', 552, 247, 26, accent, 'center'); text(ctx, String(value), 552, 326, 74, changed ? '#ecd58a' : paper, 'center');
  text(ctx, changed ? 'r += 1;' : 'x and r', 64, 424, 34, changed ? '#ecd58a' : accent);
  footer(ctx, '引用是别名，通过两个名字访问同一个对象。', `x == ${value}    r == ${value}    &x == &r`);
}

function stack(ctx: Context, time: number, accent: string) {
  const cycle = mod(time, 9), phase = Math.floor(cycle / 1.5), progress = smooth(mod(cycle, 1.5) / .65);
  const counts = [1, 2, 3, 2, 1, 0], count = counts[phase], pushing = phase < 3;
  const active = pushing ? phase : 5 - phase;
  text(ctx, 'LAST IN / FIRST OUT', 48, 153, 29, accent);
  line(ctx, [[192, 194], [192, 394], [442, 394], [442, 194]], accent, 4);
  const settled = pushing ? count - 1 : count;
  for (let i = 0; i < settled; i++) {
    const y = 329 - i * 60; box(ctx, 210, y, 214, 50, '#b88e61', '#c78e4927');
    text(ctx, ['A', 'B', 'C'][i], 317, y + 35, 38, paper, 'center');
  }
  const itemY = 329 - active * 60, x = pushing ? lerp(489, 210, progress) : lerp(210, 489, progress);
  const y = pushing ? lerp(174, itemY, progress) : lerp(itemY, 174, progress);
  box(ctx, x, y, 214, 50, accent, '#ae762a70'); text(ctx, ['A', 'B', 'C'][active], x + 107, y + 35, 38, paper, 'center');
  text(ctx, `${pushing ? 'PUSH' : 'POP'} ${['A', 'B', 'C'][active]}`, 515, 286, 35, accent);
  const displayedCount = pushing && progress < 1 ? count - 1 : count;
  text(ctx, `size = ${displayedCount}`, 515, 330, 28, muted);
  if (displayedCount > 0) { text(ctx, 'TOP', 99, 360 - (displayedCount - 1) * 60, 29, accent); arrow(ctx, [[150, 348 - (displayedCount - 1) * 60], [185, 348 - (displayedCount - 1) * 60]], accent); }
  footer(ctx, 'A、B、C 依次入栈，再按相反顺序出栈。', 'PUSH A → B → C    POP C → B → A');
}

function linkedList(ctx: Context, time: number, accent: string) {
  const n = Math.floor(mod(time, 8) / 2), p = mod(time, 2) / 2;
  const nodes: Point[] = [[63, 232], [268, 316], [475, 202]];
  const addresses = ['0x40', '0x18', '0x70'];
  text(ctx, 'LOGICAL ORDER ≠ ADDRESS ORDER', 48, 153, 27, accent);
  nodes.forEach(([x, y], i) => {
    box(ctx, x, y, 148, 72, i === n ? '#ffe1a3' : accent, i === n ? '#5e97a330' : '#08111870');
    line(ctx, [[x + 60, y], [x + 60, y + 72]], accent, 1);
    text(ctx, String([7, 21, 35][i]), x + 30, y + 46, 37, paper, 'center');
    text(ctx, i === 2 ? 'NULL' : addresses[i + 1], x + 104, y + 44, 25, accent, 'center');
    text(ctx, addresses[i], x, y - 14, 25, muted);
  });
  const routes: Point[][] = [[[169, 304], [169, 352], [262, 352]], [[373, 316], [373, 238], [470, 238]]];
  routes.forEach(route => arrow(ctx, route, accent));
  if (n < 2) pulse(ctx, routes[n], p, '#ffe1a3');
  text(ctx, n === 3 ? 'current == nullptr' : `current → ${addresses[n]}`, 48, 419, 32, n === 3 ? '#ffe1a3' : accent);
  footer(ctx, '跟随 next 找到后继，结点不必在内存中相邻。', 'HEAD → 7 → 21 → 35 → NULL');
}

function sceneTree(ctx: Context, time: number, accent: string) {
  const p = mod(time, 8) / 8, signaled = p > .5;
  const nodes: [string, number, number, number][] = [['World', 304, 155, 160], ['Player', 100, 251, 154], ['Enemy', 306, 251, 154], ['UI', 522, 251, 154], ['Sprite2D', 51, 351, 156], ['Camera2D', 229, 351, 156]];
  line(ctx, [[384, 207], [384, 228], [177, 228], [177, 251]], '#73849f');
  line(ctx, [[384, 228], [599, 228], [599, 251]], '#73849f');
  line(ctx, [[384, 228], [384, 251]], '#73849f');
  line(ctx, [[177, 303], [177, 327], [129, 327], [129, 351]], '#73849f');
  line(ctx, [[177, 327], [307, 327], [307, 351]], '#73849f');
  nodes.forEach(([label, x, y, w], i) => { box(ctx, x, y, w, 52, i === 3 && signaled ? '#e4cc7e' : accent); text(ctx, label, x + w / 2, y + 35, 29, paper, 'center'); });
  const signal: Point[] = [[254, 277], [275, 277], [275, 315], [696, 315], [696, 277], [676, 277]];
  line(ctx, signal, '#e4cc7e', 3, true);
  pulse(ctx, signal, smooth((p - .23) / .27), '#e4cc7e');
  text(ctx, `HP ${signaled ? '75' : '100'}`, 600, 345, 31, signaled ? '#e4cc7e' : muted, 'center');
  footer(ctx, '父子关系组成场景树，信号连接独立的行为。', 'Player.emit_signal("health_changed", 75)');
}

function transform(ctx: Context, time: number, accent: string) {
  const a = time * .36, origin: Point = [317, 296], radius = 108;
  grid(ctx, 74, 162, 480, 250);
  arrow(ctx, [[94, 296], [542, 296]], '#647f71', 2); arrow(ctx, [[317, 164], [317, 412]], '#647f71', 2);
  text(ctx, 'X', 548, 302, 27, muted); text(ctx, 'Y', 324, 414, 27, muted);
  ctx.save(); ctx.translate(...origin); ctx.rotate(a); box(ctx, -54, -45, 108, 90, accent, '#7ca47720');
  arrow(ctx, [[0, 0], [radius, 0]], '#e3c47f'); dot(ctx, radius, 0, '#e3c47f', 10); ctx.restore();
  dot(ctx, ...origin, '#f0efdf', 5);
  const wx = Math.round(radius * Math.cos(a)), wy = Math.round(radius * Math.sin(a));
  text(ctx, 'PARENT', 572, 199, 27, accent); text(ctx, `${Math.round(mod(a, Math.PI * 2) * 180 / Math.PI)}°`, 572, 236, 39, paper);
  text(ctx, 'LOCAL', 572, 287, 26, '#e3c47f'); text(ctx, '(108, 0)', 572, 322, 27, paper);
  text(ctx, 'WORLD Δ', 572, 365, 26, accent); text(ctx, `${wx}, ${wy}`, 572, 398, 27, paper);
  footer(ctx, '子结点的局部位置不变，世界位置随父级旋转。', 'world = parent_transform × local');
}

function delta(ctx: Context, time: number, accent: string) {
  const elapsed = mod(time, 4.5), speed = 112;
  [30, 60].forEach((hz, i) => {
    const y = 220 + i * 125, sampled = Math.floor(elapsed * hz) / hz, x = 166 + sampled * speed;
    text(ctx, `${hz} Hz`, 51, y + 10, 35, i ? '#8ccddd' : accent);
    line(ctx, [[164, y], [680, y]], '#5c7885', 3);
    for (let j = 0; j <= Math.floor(elapsed * hz); j += Math.max(1, Math.floor(hz / 10))) dot(ctx, 166 + j / hz * speed, y, i ? '#8ccddd45' : '#e4cc7e45', 2);
    dot(ctx, x, y, i ? '#8ccddd' : accent, 11);
    text(ctx, `dt = ${(1 / hz).toFixed(4)} s`, 166, y + 48, 28, muted);
    text(ctx, `${(sampled * speed).toFixed(1)} px`, 680, y + 48, 28, paper, 'right');
  });
  text(ctx, `TIME ${elapsed.toFixed(2)} s   /   SPEED ${speed} px/s`, 48, 157, 29, accent);
  footer(ctx, '相同经过时间，相同速度；帧率改变采样间隔。', 'position.x += speed * delta;');
}

const codeLines: [string, string][] = [
  ['class_name MovingNote', '#dab480'], ['extends Node2D', '#a9d4bd'], ['', paper],
  ['@export var speed: float = 112.0', '#83bed2'], ['', paper],
  ['func _process(delta: float) -> void:', '#dab480'], ['    position.x += speed * delta', '#c8dccb'],
];
function code(ctx: Context, time: number, accent: string) {
  const total = codeLines.reduce((sum, [value]) => sum + value.length, 0), typed = Math.min(total, Math.floor(mod(time, 15) * 18));
  box(ctx, 42, 139, 684, 279, '#739b87', '#0b1719');
  ctx.fillStyle = '#253f36'; ctx.fillRect(43, 140, 682, 37); text(ctx, 'moving_note.gd', 63, 167, 27, accent);
  let remaining = typed, cursor: Point = [96, 202];
  codeLines.forEach(([value, color], i) => {
    const shown = value.slice(0, Math.max(0, remaining)), y = 210 + i * 28;
    text(ctx, String(i + 1).padStart(2, '0'), 64, y, 25, '#648e7c');
    text(ctx, shown, 100, y, 25, color);
    if (remaining >= 0 && remaining <= value.length) { ctx.font = `25px ${face}`; cursor = [100 + ctx.measureText(shown).width, y - 19]; }
    remaining -= value.length;
  });
  if (Math.floor(time * 1.5) % 2 === 0 && typed < total) { ctx.fillStyle = accent; ctx.fillRect(cursor[0], cursor[1], 10, 23); }
  footer(ctx, '命名、类型与缩进表达意图；此画面只展示代码。', typed < total ? `TYPING ${typed}/${total}   /   GDSCRIPT NOTES` : 'snake_case   ·   type hints   ·   indentation');
}

function rag(ctx: Context, time: number, accent: string) {
  const stage = Math.floor(mod(time, 10) / 2), phase = mod(time, 2) / 2;
  const names = ['QUERY', 'EMBED', 'RETRIEVE', 'CONTEXT', 'ANSWER'];
  names.forEach((name, i) => {
    const x = 48 + i * 137, selected = i === stage;
    box(ctx, x, 177, 122, 61, selected ? '#ead293' : '#7e80a9', selected ? '#9c94e033' : '#11172780');
    text(ctx, name, x + 61, 216, 26, selected ? '#ead293' : accent, 'center');
    if (i < 4) arrow(ctx, [[x + 124, 208], [x + 134, 208]], '#8e96b6', 2);
  });
  if (stage < 4) dot(ctx, lerp(172 + stage * 137, 183 + stage * 137, phase), 208, '#ead293', 4);
  text(ctx, 'Q  如何让角色匀速移动？', 48, 151, 24, paper, 'left', true);
  const docs = ['D2  Godot / delta time', 'D5  frame-independent movement', 'D8  unrelated notes'];
  docs.forEach((value, i) => {
    const y = 276 + i * 40, selected = stage >= 2 && i < 2;
    box(ctx, 55, y, 403, 33, selected ? accent : '#575c7c', selected ? '#a39bda20' : '#11172740');
    text(ctx, value, 68, y + 25, 25, selected ? paper : muted);
  });
  box(ctx, 488, 276, 218, 113, stage >= 3 ? '#ead293' : '#575c7c');
  text(ctx, stage >= 4 ? 'CITED ANSWER' : 'CONTEXT', 597, 310, 27, stage >= 3 ? '#ead293' : muted, 'center');
  text(ctx, stage >= 3 ? '[D2] + [D5]' : '...', 597, 360, 31, accent, 'center');
  footer(ctx, '检索片段为回答提供上下文；这里是流程示意。', 'ILLUSTRATIVE DOCUMENTS / NO LIVE MODEL CALL');
}

function pixelGame(ctx: Context, time: number, accent: string) {
  const t = mod(time, 12), world = t * 68;
  ctx.save(); ctx.beginPath(); ctx.rect(42, 137, 684, 282); ctx.clip();
  const sky = ctx.createLinearGradient(0, 137, 0, 419); sky.addColorStop(0, '#233657'); sky.addColorStop(1, '#5f6170');
  ctx.fillStyle = sky; ctx.fillRect(42, 137, 684, 282);
  // Each layer scrolls at a different fraction of the same deterministic world time.
  for (let layer = 0; layer < 2; layer++) {
    const unit = layer ? 66 : 92, speed = layer ? .4 : .16;
    ctx.fillStyle = layer ? '#293e4d' : '#42506a';
    for (let i = -1; i < 13; i++) {
      const x = 42 + i * unit - mod(world * speed, unit), top = 223 + layer * 43 - mod(i * 37, 63);
      ctx.fillRect(x, top, unit - 9, 395 - top);
    }
  }
  ctx.fillStyle = '#dccd9b'; ctx.fillRect(600 - t * 1.5, 161, 24, 24);
  ctx.fillStyle = '#30423d'; ctx.fillRect(42, 390, 684, 29);
  for (let i = -1; i < 25; i++) { const x = 42 + i * 30 - mod(world, 30); ctx.fillStyle = '#788265'; ctx.fillRect(x, 386, 27, 7); ctx.fillStyle = '#4d5e4d'; ctx.fillRect(x, 397, 14, 8); }
  const jump = Math.max(0, Math.sin(mod(t, 3) / 3 * Math.PI * 2)) * 76, px = 263, py = 346 - Math.round(jump / 4) * 4;
  ctx.fillStyle = '#e6c68c'; ctx.fillRect(px + 4, py, 20, 16); ctx.fillStyle = '#1a2d38'; ctx.fillRect(px + 20, py + 4, 4, 4);
  ctx.fillStyle = '#7cabb0'; ctx.fillRect(px, py + 16, 28, 16);
  ctx.fillStyle = '#d1b184'; const step = Math.floor(t * 6) % 2; ctx.fillRect(px + (step ? 0 : 4), py + 32, 8, 8); ctx.fillRect(px + (step ? 20 : 16), py + 32, 8, 8);
  ctx.fillStyle = '#e6c68c';
  for (let i = 0; i < 4; i++) { const x = 42 + mod(240 + i * 190 - world, 684); ctx.fillRect(x, 306 + Math.round(Math.sin(t * 1.6 + i) * 2) * 3, 8, 14); }
  text(ctx, 'AUTO PLAY / MOTION STUDY', 59, 166, 25, paper);
  ctx.restore();
  line(ctx, [[42, 137], [726, 137], [726, 419], [42, 419], [42, 137]], '#7b99ad', 2);
  footer(ctx, '原创像素运动习作：角色、地形与多层背景。', 'CONCEPT VISUALIZATION / NOT AN INTERACTIVE GAME');
}

const painters: Record<TapeKind, (ctx: Context, time: number, accent: string) => void> = {
  pointer, array, string: stringScan, reference, stack, 'linked-list': linkedList,
  'scene-tree': sceneTree, transform, delta, code, rag, 'pixel-game': pixelGame,
};

/** Pure, time-addressable tape artwork. time is elapsed seconds; the caller owns transport state. */
export function paintTape(ctx: Context, tape: Tape, time: number, width: number, height: number): void {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return;
  const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0;
  const [background, accent] = palettes[tape.kind];
  ctx.save();
  ctx.setTransform(width / 768, 0, 0, height / 576, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  ctx.fillStyle = background; ctx.fillRect(0, 0, 768, 576);
  text(ctx, tape.title, 47, 84, 36, paper, 'left', true);
  text(ctx, '概念可视化', 718, 80, 24, accent, 'right', true);
  line(ctx, [[47, 108], [721, 108]], accent, 2);
  ctx.save(); ctx.beginPath(); ctx.rect(40, 128, 688, 375); ctx.clip();
  painters[tape.kind](ctx, elapsed, accent);
  ctx.restore();
  line(ctx, [[47, 516], [721, 516]], `${accent}80`, 1);
  text(ctx, '▶ PLAY', 47, 552, 29, paper);
  text(ctx, tape.label, 384, 551, 27, accent, 'center');
  const seconds = Math.floor(elapsed), stamp = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  text(ctx, stamp, 720, 552, 29, paper, 'right');
  ctx.restore();
}

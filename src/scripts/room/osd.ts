import projection from './screen-projection.json';

/** Project a flat OSD into the same camera plane used by Blender's CRT glass. */
export function positionOSD(element: HTMLElement, width: number, height: number) {
  const scale = width / projection.width;
  const top = (height - projection.height * scale) / 2;
  const target = projection.corners.map(([x, y]) => [x * scale, y * scale + top]);
  mapPlane(element, 768, 576, target);
}

export function mapPlane(element: HTMLElement, width: number, height: number, target: number[][]) {
  const source = [[0, 0], [width, 0], [width, height], [0, height]];
  const equations: number[][] = [];
  source.forEach(([x, y], i) => {
    const [u, v] = target[i];
    equations.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    equations.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(equations[row][col]) > Math.abs(equations[pivot][col])) pivot = row;
    }
    [equations[col], equations[pivot]] = [equations[pivot], equations[col]];
    const divisor = equations[col][col];
    equations[col] = equations[col].map((value) => value / divisor);
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = equations[row][col];
      equations[row] = equations[row].map((value, i) => value - factor * equations[col][i]);
    }
  }
  const [a, b, c, d, e, f, g, h] = equations.map((row) => row[8]);
  element.style.transform = `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

export function paintOSD(canvas: HTMLCanvasElement, title: string, detail: string, progress?: number) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 768, 576);
  ctx.fillStyle = '#f0f4ff';
  ctx.textAlign = 'center';
  ctx.font = '64px RoomPixel, monospace';
  ctx.fillText(title, 384, 257);
  ctx.font = '38px RoomPixel, monospace';
  ctx.fillText(detail, 384, 322);
  if (progress !== undefined) {
    ctx.fillStyle = '#d7e3ff55';
    ctx.fillRect(168, 364, 432, 4);
    ctx.fillStyle = '#f0f4ff';
    ctx.fillRect(168, 364, 432 * progress / 100, 4);
  }
}

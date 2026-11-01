/** Window inspection uses a complete 3:1 plate, independent of the Home card. */
export const windowInspection = {
  width: 29.12,
  height: 29.12 / 3,
  // Fallback photo centre for the authored city card, after its UV mapping.
  // The live scene derives this from the loaded mesh rather than these values.
  position: [.0052, -.30332, -12.068],
  eye: [-1.15, 2.40, .90],
  margin: .94,
  detailZoom: 2.5,
  maxZoom: 3.5,
} as const;

export type WindowProjection = {
  width:number;
  height:number;
  position:readonly [number,number,number];
  sourceBounds?:{min:WindowPoint;max:WindowPoint};
};

/** The first look fills the aperture, including squarer desktop windows. */
export function windowDetailZoom(aspect: number) {
  return Math.min(windowInspection.maxZoom, Math.max(windowInspection.detailZoom, Math.max(aspect / 3, 3 / aspect) / windowInspection.margin * 1.03));
}

export type WindowPoint = readonly [number, number];
export type WindowFrame = { zoom: number; center: WindowPoint };
export type WindowAnchor = { x: number; y: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Start on image pixels already present in the room's physical city card.
 * Overview and subsequent panning still use the entire original photograph. */
export function windowEntryFrame(aspect:number,projection:WindowProjection=windowInspection):WindowFrame {
  const bounds=projection.sourceBounds??{min:[0,0] as const,max:[1,.811375] as const};
  const min=bounds.min.map(v=>clamp(v,0,1)),max=bounds.max.map(v=>clamp(v,0,1));
  const fit=Math.max(Math.max(1,aspect/3)/Math.max(.01,max[0]-min[0]-.012),Math.max(1,3/aspect)/Math.max(.01,max[1]-min[1]-.012))/windowInspection.margin;
  return constrainWindow({zoom:Math.max(windowDetailZoom(aspect),fit),center:[(min[0]+max[0])/2,(min[1]+max[1])/2]},aspect);
}

/** Visible image fractions; values above one mean deliberate letterboxing. */
export function windowSpan(aspect: number, zoom: number): WindowPoint {
  const scale = windowInspection.margin * zoom;
  return [Math.max(1, aspect / 3) / scale, Math.max(1, 3 / aspect) / scale];
}

export function windowBounds(aspect: number, zoom: number) {
  const [u, v] = windowSpan(aspect, zoom);
  const min: WindowPoint = [Math.min(.5, u / 2), Math.min(.5, v / 2)];
  const max: WindowPoint = [1 - min[0], 1 - min[1]];
  return { min, max };
}

export function constrainWindow(frame: WindowFrame, aspect: number): WindowFrame {
  const zoom = clamp(frame.zoom, 1, windowInspection.maxZoom);
  const { min, max } = windowBounds(aspect, zoom);
  return { zoom, center: [clamp(frame.center[0], min[0], max[0]), clamp(frame.center[1], min[1], max[1])] };
}

export function windowPointAt(frame: WindowFrame, aspect: number, anchor: WindowAnchor): WindowPoint {
  const [u, v] = windowSpan(aspect, frame.zoom);
  return [frame.center[0] + anchor.x * u / 2, frame.center[1] - anchor.y * v / 2];
}

export function zoomWindow(frame: WindowFrame, aspect: number, zoom: number, anchor: WindowAnchor = { x: 0, y: 0 }): WindowFrame {
  const point = windowPointAt(frame, aspect, anchor);
  zoom = clamp(zoom, 1, windowInspection.maxZoom);
  const [u, v] = windowSpan(aspect, zoom);
  return constrainWindow({ zoom, center: [point[0] - anchor.x * u / 2, point[1] + anchor.y * v / 2] }, aspect);
}

export function panWindow(frame: WindowFrame, width: number, height: number, dx: number, dy: number): WindowFrame {
  const aspect = width / height, [u, v] = windowSpan(aspect, frame.zoom);
  return constrainWindow({ zoom: frame.zoom, center: [frame.center[0] - dx / width * u, frame.center[1] - dy / height * v] }, aspect);
}

export function easeWindow(from: WindowFrame, to: WindowFrame, aspect: number, alpha: number): WindowFrame {
  // Interpolate inverse zoom with the centre: this preserves a zoom anchor
  // throughout the animation, not only at its two endpoints.
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  return constrainWindow({ zoom: 1 / mix(1 / from.zoom, 1 / to.zoom), center: [mix(from.center[0], to.center[0]), mix(from.center[1], to.center[1])] }, aspect);
}

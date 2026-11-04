import { Mesh, OrthographicCamera, Spherical, Vector2, Vector3, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { IslandView } from './types';

type Pose = { target: Vector3; offset: Vector3; span: number; zoom: number; shift: Vector2 };
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** A view change interpolates the entire current camera, including its shifted
 * frustum. Moving only the look target produces a jump before the first frame. */
export function createNavigation(camera: OrthographicCamera, element: HTMLElement, anchors: Map<IslandView, Vector3>, model?: Object3D) {
  const originalTouchAction = element.style.touchAction;
  const controls = new OrbitControls(camera, element);
  // The homepage is a fixed viewport: dragging or pinching belongs to the scene.
  element.style.touchAction = 'none';
  controls.enablePan = false;
  controls.enableDamping = false;
  // An open island can be viewed from every side; keep the camera above ground.
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = .42;
  controls.maxPolarAngle = 1.35;
  controls.minZoom = .85;
  controls.maxZoom = 2.2;
  controls.rotateSpeed = .4;
  controls.zoomSpeed = .65;
  const home = new Vector3(0, 1.55, 0), homeOffset = new Vector3(9, 10, 15).normalize().multiplyScalar(22);
  // Fit the actual authored silhouettes instead of shrinking a growing island
  // with a fixed oversized frustum. This runs once, never in the frame loop.
  let fitX = 7.35, fitY = 5.9;
  if (model) {
    const right = new Vector3().crossVectors(new Vector3(0,1,0), homeOffset).normalize();
    const up = new Vector3().crossVectors(homeOffset, right).normalize(), point = new Vector3();
    let maxX = 0, maxY = 0;
    model.updateWorldMatrix(true, true);
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position'); if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).sub(home);
        maxX = Math.max(maxX, Math.abs(point.dot(right))); maxY = Math.max(maxY, Math.abs(point.dot(up)));
      }
    });
    fitX = maxX + .28; fitY = maxY + .28;
  }
  let width = 1, height = 1, selected: IslandView | null = null;
  let moving = false, elapsed = 0, duration = .78;
  let from: Pose, to: Pose;
  const spanFor = (view: IslandView | null) => view
    ? Math.max(view === 'library' ? 3.6 : 3.1, 3.5 / (width / height))
    : Math.max(fitY, fitX / (width / height));
  const shiftFor = (view: IslandView | null) => new Vector2(
    view && width > 767 ? Math.min(510, width * .48) / height : 0,
    view && width <= 767 ? -.48 : 0,
  );
  function snapshot(): Pose {
    const span = (camera.top - camera.bottom) / 2;
    return {
      target: controls.target.clone(), offset: camera.position.clone().sub(controls.target),
      span, zoom: camera.zoom,
      shift: new Vector2((camera.left + camera.right) / (2 * span), (camera.top + camera.bottom) / (2 * span)),
    };
  }
  function destination(view: IslandView | null, current: Pose): Pose {
    const target = view ? (anchors.get(view) ?? home).clone() : home.clone();
    if (view) target.y = Math.max(.8, target.y);
    return { target, offset: view ? current.offset.clone() : homeOffset.clone(), span: spanFor(view), zoom: 1, shift: shiftFor(view) };
  }
  function apply(pose: Pose) {
    controls.target.copy(pose.target);
    camera.position.copy(pose.target).add(pose.offset);
    camera.zoom = pose.zoom;
    const halfWidth = width / height * pose.span;
    camera.left = -halfWidth + pose.shift.x * pose.span;
    camera.right = halfWidth + pose.shift.x * pose.span;
    camera.top = pose.span + pose.shift.y * pose.span;
    camera.bottom = -pose.span + pose.shift.y * pose.span;
    camera.updateProjectionMatrix();
    controls.update();
  }
  function go(view: IslandView | null, reduced: boolean) {
    selected = view; from = snapshot(); to = destination(view, from);
    elapsed = 0; duration = view ? .78 : .72;
    if (reduced) { apply(to); moving = false; }
    else moving = true;
  }
  function update(dt: number) {
    if (!moving) return false;
    elapsed = Math.min(duration, elapsed + Math.max(0, dt));
    const t = ease(elapsed / duration);
    const startOrbit = new Spherical().setFromVector3(from.offset);
    const endOrbit = new Spherical().setFromVector3(to.offset);
    const turn = Math.atan2(Math.sin(endOrbit.theta - startOrbit.theta), Math.cos(endOrbit.theta - startOrbit.theta));
    // Return around the island on the shortest arc. Linear Cartesian offsets
    // would pass through the target when closing from the opposite side.
    const offset = new Vector3().setFromSphericalCoords(
      startOrbit.radius + (endOrbit.radius - startOrbit.radius) * t,
      startOrbit.phi + (endOrbit.phi - startOrbit.phi) * t,
      startOrbit.theta + turn * t,
    );
    apply({
      target: from.target.clone().lerp(to.target, t),
      offset,
      span: from.span + (to.span - from.span) * t,
      zoom: from.zoom + (to.zoom - from.zoom) * t,
      shift: from.shift.clone().lerp(to.shift, t),
    });
    if (elapsed === duration) { apply(to); moving = false; }
    return moving;
  }
  // An explicit gesture takes ownership of the current pose, so the transition
  // never fights a visitor's hand or continues from an obsolete starting point.
  controls.addEventListener('start', () => { moving = false; });
  camera.position.copy(home).add(homeOffset); controls.target.copy(home); controls.update();
  return {
    controls, go, update,
    homeFrame: { halfWidth: fitX, halfHeight: fitY },
    resize(w: number, h: number) {
      const current = snapshot(); width = Math.max(1, w); height = Math.max(1, h);
      current.span = spanFor(selected); current.shift = shiftFor(selected); apply(current);
      if (moving) { from = snapshot(); to = destination(selected, from); elapsed = 0; }
    },
    get moving() { return moving; },
    dispose() {
      controls.dispose(); element.style.touchAction = originalTouchAction;
    },
  };
}

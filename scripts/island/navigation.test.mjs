import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Vector3 } from 'three';
import { createNavigation } from '../../src/scripts/island/navigation.ts';

// Real Three camera/OrbitControls math, with only the event target supplied by
// Node. Browser tests separately exercise actual drag, wheel, history and focus.
class CanvasTarget extends EventTarget {
  style = {};
  ownerDocument = new EventTarget();
  clientWidth = 1440;
  clientHeight = 688;
  getRootNode() { return this.ownerDocument; }
  setPointerCapture() {}
  releasePointerCapture() {}
}
function fixture(t, width = 1440, height = 688, model) {
  const camera = new OrthographicCamera(-8, 8, 5, -5, .1, 100);
  const element = new CanvasTarget();
  element.clientWidth = width; element.clientHeight = height;
  const anchors = new Map([
    ['library', new Vector3(.7, 2.1, -1.1)],
    ['about', new Vector3(.08, 1.5, 1.6)],
    ['recent', new Vector3(-2.8, 1.5, 1.8)],
    ['categories', new Vector3(3.1, 1.3, .9)],
  ]);
  const navigation = createNavigation(camera, element, anchors, model);
  navigation.resize(width, height);
  t.after(() => navigation.dispose());
  const state = () => ({
    position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
    projection: camera.projectionMatrix.toArray(), zoom: camera.zoom,
    target: navigation.controls.target.toArray(),
  });
  const settle = () => { for (let frame = 0; frame < 180; frame++) navigation.update(1 / 60); assert(!navigation.moving, 'camera settles within three seconds'); };
  const orbit = () => {
    camera.position.copy(navigation.controls.target).add(new Vector3().setFromSphericalCoords(22, .8, .9));
    camera.zoom = 1.35; camera.updateProjectionMatrix(); navigation.controls.update();
  };
  return { camera, element, navigation, state, settle, orbit };
}
function touch(target, type, x, y, id = 1) {
  const event = new Event(type);
  Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, pageX: x, pageY: y, button: 0, buttons: 1 });
  target.dispatchEvent(event);
}
function closeState(actual, expected, message, epsilon = 1e-6) {
  for (const key of Object.keys(expected)) {
    const left = Array.isArray(actual[key]) ? actual[key] : [actual[key]];
    const right = Array.isArray(expected[key]) ? expected[key] : [expected[key]];
    assert(left.every((value, index) => Math.abs(value - right[index]) <= epsilon), `${message}: ${key}`);
  }
}
function distance(a, b) { return Math.hypot(...a.map((value, i) => value - b[i])); }

test('an expanded island fits its real transformed silhouette on wide and portrait screens', t => {
  const model = new Group(), corner = new Group();
  corner.position.set(4.8, .7, -2.2); corner.rotation.y = .42; corner.scale.set(1.2, 1, .8); model.add(corner);
  const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial();
  for (const [parent, size, position] of [
    [model, [13, .5, 10], [0,0,0]], [model, [2.4, 6.2, 2.4], [-4,3,-2]],
    [corner, [3,2,2], [0,1,0]],
  ]) { const object = new Mesh(geometry, material); object.scale.set(...size); object.position.set(...position); parent.add(object); }
  t.after(() => { geometry.dispose(); material.dispose(); });
  const { camera, navigation } = fixture(t, 1440, 754, model);
  for (const [width,height] of [[1440,754],[390,716],[844,244]]) {
    navigation.resize(width,height); navigation.go(null,true); camera.updateMatrixWorld();
    let edge = 0;
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const vertices = object.geometry.getAttribute('position');
      for (let i=0;i<vertices.count;i++) {
        const point = new Vector3().fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).project(camera);
        assert(Math.abs(point.x)<1 && Math.abs(point.y)<1, `${width}×${height} retains every authored vertex`);
        edge = Math.max(edge,Math.abs(point.x),Math.abs(point.y));
      }
    });
    assert(edge>.9, 'the complete island still uses the available viewport, without an oversized blank border');
  }
});

test('opening a content view preserves the current camera until the animated update', t => {
  const { navigation, state, orbit } = fixture(t);
  orbit();
  const before = state();
  navigation.go('about', false);
  closeState(state(), before, 'opening does not snap orientation, zoom or the panel projection offset');
  navigation.update(0);
  closeState(state(), before, 'a zero-time first frame cannot move the camera');
});

test('the first animation frame advances a small fraction of the complete camera movement', t => {
  const { navigation, state, orbit, settle } = fixture(t);
  orbit(); const before = state();
  navigation.go('about', false); navigation.update(1 / 60);
  const first = state(); settle(); const after = state();
  for (const key of ['position', 'projection']) {
    const total = distance(after[key], before[key]);
    const firstStep = distance(first[key], before[key]);
    assert(total > 0, `${key} moves in this regression fixture`);
    assert(firstStep / total < .15, `${key} does not complete more than 15% of its journey in one frame`);
  }
});

test('reset after orbit and zoom restores the exact original overview, repeatedly', t => {
  const { navigation, state, orbit, settle } = fixture(t);
  const home = state();
  for (let cycle = 0; cycle < 3; cycle++) {
    orbit(); const before = state();
    navigation.go(null, false);
    closeState(state(), before, 'reset starts from the current viewing pose');
    settle(); closeState(state(), home, 'reset restores position, orientation, zoom and projection');
  }
});

test('closing a selected view and reversing an unfinished transition do not snap', t => {
  const { navigation, state, settle } = fixture(t);
  const home = state();
  navigation.go('library', false);
  for (let frame = 0; frame < 12; frame++) navigation.update(1 / 60);
  const midway = state();
  navigation.go('recent', false);
  closeState(state(), midway, 'switching an unfinished view preserves its current frame');
  settle(); const selected = state();
  navigation.go(null, false);
  closeState(state(), selected, 'close begins at the selected frame');
  settle(); closeState(state(), home, 'close ends at the initial overview');
});

test('reduced motion settles navigation immediately on desktop and portrait layouts', t => {
  for (const [width, height] of [[1440, 688], [390, 574]]) {
    const { navigation, state, orbit } = fixture(t, width, height);
    const home = state(); orbit();
    navigation.go('about', true);
    assert(!navigation.moving, 'reduced motion has no continuing camera movement');
    const selected = state(); navigation.update(1 / 60);
    closeState(state(), selected, 'selected reduced-motion frame remains still');
    navigation.go(null, true);
    assert(!navigation.moving);
    closeState(state(), home, 'reduced-motion reset also restores the exact overview');
  }
});

test('single-finger drag changes the fixed-scene camera and cancellation ends it', t => {
  const { element, state } = fixture(t, 390, 447);
  const before = state();
  touch(element, 'pointerdown', 250, 330);
  for (const y of [327, 320, 311, 294]) touch(element.ownerDocument, 'pointermove', 250, y);
  assert(distance(state().position, before.position) > .1, 'vertical dragging belongs to the fixed scene instead of document scrolling');
  touch(element, 'pointercancel', 250, 294);
  const cancelled = state();
  touch(element.ownerDocument, 'pointermove', 280, 290);
  closeState(state(), cancelled, 'cancelled touch cannot leave an active orbit gesture');
});

test('standard two-finger separation zooms the camera without shifting its target', t => {
  const { element, state } = fixture(t, 390, 447);
  const before = state();
  touch(element, 'pointerdown', 170, 300, 1);
  touch(element, 'pointerdown', 220, 300, 2);
  touch(element.ownerDocument, 'pointermove', 260, 300, 2);
  const zoomed = state();
  assert(zoomed.zoom > before.zoom, 'a real OrbitControls two-touch dolly changes the orthographic zoom');
  assert.deepEqual(zoomed.target, before.target, 'pinch does not pan the selected target');
  touch(element.ownerDocument, 'pointerup', 170, 300, 1);
  touch(element.ownerDocument, 'pointerup', 260, 300, 2);
});

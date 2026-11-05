import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Group, NumberKeyframeTrack, Object3D } from 'three';
import { createAnimation } from '../../src/scripts/island/animation.ts';

// Real Three mixer/property bindings, with small authored tracks so the tests
// can distinguish animation state labels from actual articulated movement.
function fixture(t) {
  const root = new Group();
  for (const name of ['Bear_Head', 'Bear_Arm_R', 'Bear_Book', 'Bear_Book_Page']) {
    const part = new Object3D(); part.name = name; root.add(part);
  }
  const clips = [
    new AnimationClip('Idle', 2, [
      new NumberKeyframeTrack('Bear_Head.rotation[x]', [0, 1, 2], [0, .2, 0]),
      new NumberKeyframeTrack('Bear_Book_Page.rotation[y]', [0, 1, 2], [0, .8, 0]),
    ]),
    new AnimationClip('Wave', 2, [
      new NumberKeyframeTrack('Bear_Head.rotation[x]', [0, 1, 2], [0, -.3, 0]),
      new NumberKeyframeTrack('Bear_Arm_R.rotation[z]', [0, .5, 1.5, 2], [0, 1.2, .8, 0]),
    ]),
  ];
  const animation = createAnimation(root, clips);
  t.after(() => animation.dispose());
  let elapsed = 0;
  function advance(seconds, reduced = false) {
    for (let time = 0; time < seconds; time += 1 / 60) {
      elapsed += 1 / 60; animation.update(elapsed, 1 / 60, reduced);
    }
  }
  return { animation, advance, root };
}

test('the bear reads and turns an actual page without hover', t => {
  const { animation, advance } = fixture(t);
  const before = animation.poses(); advance(.5);
  const after = animation.poses();
  assert.equal(animation.state(), 'Idle');
  assert.notDeepEqual(after.Bear_Head, before.Bear_Head);
  assert.notDeepEqual(after.Bear_Book_Page, before.Bear_Book_Page);
});

test('only bear hover starts the authored greeting and leaving restores reading', t => {
  const { animation, advance } = fixture(t);
  animation.hover('about'); advance(.2); assert.equal(animation.state(), 'Idle');
  animation.hover('rabbit'); advance(.2); assert.equal(animation.state(), 'Idle');
  animation.hover('bear'); advance(.5);
  assert.equal(animation.state(), 'Wave');
  assert(animation.poses().Bear_Arm_R.rotation[2] > .2, 'the arm actually moves');
  animation.hover(null); advance(.5);
  assert.equal(animation.state(), 'Idle');
  assert(Math.abs(animation.poses().Bear_Arm_R.rotation[2]) < .001, 'the arm returns to its authored baseline');
});

test('reduced motion settles actual joints and a stationary hover resumes its greeting when motion returns', t => {
  const { animation, advance } = fixture(t);
  animation.hover('bear'); advance(.5);
  advance(1 / 60, true);
  const stopped = animation.poses(); advance(.5, true);
  assert.equal(animation.state(), 'still');
  assert.deepEqual(animation.poses(), stopped);
  animation.hover(null); animation.hover('bear'); advance(.2, true);
  assert.deepEqual(animation.poses(), stopped);
  advance(.3);
  assert.equal(animation.state(), 'Wave', 'hover remains active even when it began in reduced motion');
  assert.notDeepEqual(animation.poses(), stopped);
});

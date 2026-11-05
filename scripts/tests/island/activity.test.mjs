import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Object3D, Scene } from 'three';
import { createActivity } from '../../../src/scripts/island/activity.ts';
import { releaseObjectResources } from '../../../src/scripts/island/resources.ts';

function fixture(t, flowAxis = [0, -1, 0]) {
  const root = new Group(), scene = new Scene(); scene.add(root);
  const names = ['Dog_Head', 'Dog_Tail', 'Dog_Ear_L', 'Dog_Ear_R', 'Dog_Arm_L', 'Dog_Eye_L', 'Dog_Eye_R',
    'Rabbit_Head', 'Rabbit_Ear_L', 'Rabbit_Ear_R', 'Rabbit_Eye_L', 'Rabbit_Eye_R', 'Rabbit_WateringCan'];
  const parts = new Map(names.map((name, index) => {
    const object = new Object3D(); object.name = name;
    object.rotation.set(.02 * index, -.01 * index, .005 * index);
    object.scale.set(1, .3 + index * .01, 1); root.add(object);
    return [name, object];
  }));
  const can = parts.get('Rabbit_WateringCan');
  can.userData.pour_axis = 'x'; can.userData.pour_angle = -.42;
  const nozzle = new Object3D(); nozzle.name = 'Rabbit_WaterNozzleAnchor'; nozzle.position.set(1, 2, 0); can.add(nozzle);
  nozzle.userData.flow_axis = flowAxis;
  const target = new Object3D(); target.name = 'Rabbit_WaterTargetAnchor'; target.position.set(2, 0, 0); root.add(target);
  const baseline = new Map([...parts].map(([name, object]) => [name, { rotation: object.rotation.toArray(), scale: object.scale.toArray() }]));
  const activity = createActivity(root, scene);
  t.after(() => releaseObjectResources(scene));
  return { activity, parts, baseline };
}

test('unhovered dog and rabbit carry out actual sniffing and watering movements', t => {
  const { activity, parts, baseline } = fixture(t);
  const upward = fixture(t, [0, 1, 0]);
  let sniff = 0, pour = 0, upwardPour = 0, water = false, canRotation = 0;
  for (let time = 0; time <= 14; time += .05) {
    activity.update(time, .05, false);
    upward.activity.update(time, .05, false);
    upwardPour = Math.max(upwardPour, upward.activity.state().rabbit.pour);
    assert.equal(upward.activity.state().waterVisible, false, 'an upward-facing nozzle cannot emit water even during a pouring pose');
    const state = activity.state(); sniff = Math.max(sniff, state.dog.sniff); pour = Math.max(pour, state.rabbit.pour);
    water ||= state.waterVisible;
    canRotation = Math.max(canRotation, Math.abs(parts.get('Rabbit_WateringCan').rotation.x - baseline.get('Rabbit_WateringCan').rotation[0]));
    assert.equal(state.active, null);
    for (const actor of ['Dog', 'Rabbit']) {
      const left = `${actor}_Eye_L`, right = `${actor}_Eye_R`;
      assert(Math.abs(parts.get(left).scale.y / baseline.get(left).scale[1] - parts.get(right).scale.y / baseline.get(right).scale[1]) < 1e-12, `${actor} blinks both eyes together`);
    }
  }
  assert(sniff > .8 && pour > .8 && water, 'idle activities include both sniffing and visible watering');
  assert(upwardPour > .8, 'the upward-nozzle case exercised a full pouring pose');
  assert(canRotation > .3, 'the real can rotates on its authored metadata axis');
  assert.equal(parts.get('Rabbit_WateringCan').rotation.z, baseline.get('Rabbit_WateringCan').rotation[2], 'pouring does not use a guessed world axis');
  assert.notDeepEqual(parts.get('Dog_Head').rotation.toArray(), baseline.get('Dog_Head').rotation);
});

test('greetings transition independently and reduced motion restores all joints and eye scales', t => {
  const { activity, parts, baseline } = fixture(t);
  activity.hover('about');
  for (let time = 0; time < 1; time += .05) activity.update(time, .05, false);
  assert(activity.state().dog.greeting > .9);
  assert(Math.abs(parts.get('Dog_Arm_L').rotation.z - baseline.get('Dog_Arm_L').rotation[2]) > .5);
  activity.hover('rabbit');
  for (let time = 1; time < 3; time += .05) activity.update(time, .05, false);
  assert(activity.state().rabbit.greeting > .9 && activity.state().dog.greeting < .001);
  assert.equal(activity.state().waterVisible, false, 'the rabbit pauses watering while greeting');
  activity.update(3, .05, true);
  for (const [name, object] of parts) {
    assert(object.rotation.toArray().slice(0, 3).every((value, index) => Math.abs(value - baseline.get(name).rotation[index]) < 1e-12), `${name} restores its authored rotation`);
    assert.deepEqual(object.scale.toArray(), baseline.get(name).scale, `${name} restores its authored scale`);
  }
  const stopped = activity.state(); activity.update(30, .05, true);
  assert.deepEqual(activity.state(), stopped, 'time does not move a reduced-motion pose');
  assert.equal(stopped.dog.activity, 'still'); assert.equal(stopped.rabbit.activity, 'still');
  assert.equal(stopped.waterVisible, false);
});

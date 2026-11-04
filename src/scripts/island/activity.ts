import { InstancedMesh, MathUtils, MeshStandardMaterial, Object3D, SphereGeometry, Vector3, type Scene } from 'three';
import type { HoverTarget } from './types';

/** Everyday activities have one owner per joint. The bear stays in its authored
 * mixer clips; the dog and rabbit use these authored pivots and prop anchors. */
export function createActivity(root: Object3D, scene: Scene) {
  const parts = new Map<string, { object: Object3D; rotation: Object3D['rotation']; scale: Vector3 }>();
  for (const name of ['Dog_Head', 'Dog_Tail', 'Dog_Ear_L', 'Dog_Ear_R', 'Dog_Arm_L', 'Dog_Eye_L', 'Dog_Eye_R',
    'Rabbit_Head', 'Rabbit_Ear_L', 'Rabbit_Ear_R', 'Rabbit_Eye_L', 'Rabbit_Eye_R', 'Rabbit_WateringCan']) {
    const object = root.getObjectByName(name);
    if (object) parts.set(name, { object, rotation: object.rotation.clone(), scale: object.scale.clone() });
  }
  const nozzle = root.getObjectByName('Rabbit_WaterNozzleAnchor');
  const target = root.getObjectByName('Rabbit_WaterTargetAnchor');
  const can = parts.get('Rabbit_WateringCan')?.object;
  const flowAxis = new Vector3(...(nozzle?.userData.flow_axis ?? [0, 0, 1]) as [number, number, number]).normalize();
  const pourAxis = (['x','y','z'].includes(can?.userData.pour_axis) ? can?.userData.pour_axis : 'z') as 'x'|'y'|'z';
  const pourAngle = typeof can?.userData.pour_angle === 'number' ? can.userData.pour_angle : -.4;
  const waterMaterial = new MeshStandardMaterial({ color: '#87d9df', roughness: .25, transparent: true, opacity: .8, depthWrite: false });
  const drops = new InstancedMesh(new SphereGeometry(.024, 7, 5), waterMaterial, 18);
  drops.name = 'Rabbit_WateringDrops'; drops.visible = false; drops.frustumCulled = false; scene.add(drops);
  const dummy = new Object3D(), start = new Vector3(), end = new Vector3(), control = new Vector3();
  const direction = new Vector3(), tangent = new Vector3(), up = new Vector3(0, 1, 0);
  let active: HoverTarget | null = null, reduced = true, motion = 0, dogGreeting = 0, rabbitGreeting = 0, sniff = 0, pour = 0;
  let tailPhase = 0, earPhase = 0;
  const rotate = (name: string, axis: 'x'|'y'|'z', value: number) => {
    const part = parts.get(name); if (part) part.object.rotation[axis] = part.rotation[axis] + value;
  };
  function blink(name: string, value: number) {
    const part = parts.get(name); if (part) part.object.scale.y = part.scale.y * (1 - .88 * value);
  }
  const beat = (phase: number, from: number, until: number, fade = .8) =>
    MathUtils.smoothstep(phase, from, from + fade) * (1 - MathUtils.smoothstep(phase, until, until + fade));
  function update(time: number, dt: number, nextReduced: boolean) {
    reduced = nextReduced;
    motion = reduced ? 0 : MathUtils.damp(motion, 1, 4, dt);
    dogGreeting = reduced ? 0 : MathUtils.damp(dogGreeting, Number(active === 'about'), 6, dt);
    rabbitGreeting = reduced ? 0 : MathUtils.damp(rabbitGreeting, Number(active === 'rabbit'), 6, dt);
    if (!reduced) { tailPhase += dt * (4.2 + dogGreeting * 6.8); earPhase += dt * (2.3 + dogGreeting * 2.7); }
    // A short sniff at the flowers, a look around, then another unhurried pause.
    sniff = beat(time % 12, .8, 4, 1) * motion * (1 - dogGreeting);
    const looking = (1 - sniff) * motion * (1 - dogGreeting);
    rotate('Dog_Head', 'x', sniff * (.22 + Math.sin(time * 8) * .018) + dogGreeting * .025);
    rotate('Dog_Head', 'y', looking * Math.sin(time * .7) * .085);
    rotate('Dog_Head', 'z', looking * Math.sin(time * .9) * .025 + dogGreeting * (.09 + Math.sin(time * 3) * .03));
    rotate('Dog_Tail', 'y', motion * Math.sin(tailPhase) * (.17 + sniff * .1 + dogGreeting * .7));
    rotate('Dog_Ear_L', 'x', motion * Math.sin(earPhase) * (.025 + dogGreeting * .075));
    rotate('Dog_Ear_R', 'x', motion * Math.sin(earPhase + .8) * (.02 + dogGreeting * .055));
    rotate('Dog_Ear_L', 'z', dogGreeting * -.035);
    rotate('Dog_Ear_R', 'z', dogGreeting * .035);
    rotate('Dog_Arm_L', 'y', dogGreeting * .68);
    rotate('Dog_Arm_L', 'z', dogGreeting * (-1.2 + Math.sin(time * 7) * .15));
    const dogBlink = reduced ? 0 : Math.exp(-Math.pow(((time + 2.1) % 5.3 - 4.8) / .105, 2));
    blink('Dog_Eye_L', dogBlink); blink('Dog_Eye_R', dogBlink);

    // The rabbit tends a real flowerbed. A visitor makes her stop pouring,
    // look up, and lift her floppy ears; the can stays attached to her hand.
    pour = beat((time + 1.4) % 14, 1, 6, 1.2) * motion * (1 - rabbitGreeting);
    rotate('Rabbit_WateringCan', pourAxis, pour * pourAngle);
    rotate('Rabbit_Head', 'x', pour * .14 - rabbitGreeting * .08);
    rotate('Rabbit_Head', 'y', (1 - pour) * motion * Math.sin(time * .55) * .07);
    rotate('Rabbit_Head', 'z', rabbitGreeting * Math.sin(time * 3.2) * .1);
    rotate('Rabbit_Ear_L', 'x', motion * Math.sin(time * 1.7) * .03 + rabbitGreeting * Math.sin(time * 6) * .065);
    rotate('Rabbit_Ear_R', 'x', motion * Math.sin(time * 1.7 + .9) * .025 + rabbitGreeting * Math.sin(time * 6 + .8) * .055);
    rotate('Rabbit_Ear_L', 'z', rabbitGreeting * -.24);
    rotate('Rabbit_Ear_R', 'z', rabbitGreeting * .22);
    const rabbitBlink = reduced ? 0 : Math.exp(-Math.pow(((time + .4) % 6.1 - 5.5) / .12, 2));
    blink('Rabbit_Eye_L', rabbitBlink); blink('Rabbit_Eye_R', rabbitBlink);
    drops.visible = !reduced && Boolean(nozzle && target) && pour > .35;
    if (drops.visible) {
      nozzle!.getWorldPosition(start); target!.getWorldPosition(end);
      // The first tangent follows the actual spout, including its authored
      // upward bend. Water starts only after that opening points downwards.
      direction.copy(flowAxis).transformDirection(nozzle!.matrixWorld);
      drops.visible = direction.y < -.02;
      control.copy(start).addScaledVector(direction, start.distanceTo(end) * .4);
      waterMaterial.opacity = .82 * MathUtils.smoothstep(pour, .35, .8);
      for (let i = 0; i < 18; i++) {
        const t = (time * 1.25 + i / 18) % 1, a = i * 2.39996;
        dummy.position.copy(start).multiplyScalar((1-t)*(1-t)).addScaledVector(control, 2*(1-t)*t).addScaledVector(end, t*t);
        dummy.position.x += Math.cos(a) * .055 * t; dummy.position.z += Math.sin(a) * .055 * t;
        tangent.subVectors(control, start).multiplyScalar(1-t).addScaledVector(end, t).addScaledVector(control, -t).normalize();
        dummy.quaternion.setFromUnitVectors(up, tangent);
        dummy.scale.set(.8, 1.5, .8); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    }
  }
  const pose = (names: string[]) => Object.fromEntries(names.flatMap(name => {
    const part = parts.get(name); return part ? [[name, { rotation: part.object.rotation.toArray().slice(0,3), scale: part.object.scale.toArray() }]] : [];
  }));
  return {
    hover(target: HoverTarget | null) { active = target; }, update,
    state() { return {
      reduced, active, pivots: [...parts.keys()], waterVisible: drops.visible,
      dog: { activity: reduced ? 'still' : dogGreeting > .1 ? 'greeting' : sniff > .2 ? 'sniffing' : 'looking-around', sniff, greeting: dogGreeting,
        poses: pose(['Dog_Head','Dog_Tail','Dog_Ear_L','Dog_Arm_L','Dog_Eye_L']) },
      rabbit: { activity: reduced ? 'still' : rabbitGreeting > .1 ? 'greeting' : pour > .35 ? 'watering' : 'resting', pour, greeting: rabbitGreeting,
        poses: pose(['Rabbit_Head','Rabbit_Ear_L','Rabbit_WateringCan','Rabbit_Eye_L']) },
    }; },
  };
}

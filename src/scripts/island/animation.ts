import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import type { HoverTarget } from './types';

/** Keep the bear's authored clips and let the garden birds quietly look around.
 * Reduced motion restores their original pose and stops every idle loop. */
export function createAnimation(root: Object3D, clips: AnimationClip[]) {
  const mixer = new AnimationMixer(root);
  const actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  const idle = actions.get('Idle');
  idle?.setLoop(LoopRepeat, Infinity).play();
  let attended = false, reduced = false;
  let foreground: AnimationAction | undefined, retiring: AnimationAction | undefined, retireAfter = 0;
  const birds = ['GardenBird_0', 'GardenBird_1', 'GardenBird_2'].flatMap(name => {
    const object = root.getObjectByName(name);
    return object ? [{ object, rotation: object.rotation.clone() }] : [];
  });
  function play(name: string) {
    if (reduced) return;
    const next = actions.get(name); if (!next) return;
    if (foreground === next && next.isRunning()) return;
    retiring?.stop(); retiring = undefined;
    const previous = foreground ?? idle;
    next.reset().setLoop(LoopOnce, 1); next.clampWhenFinished = true;
    next.enabled = true; next.setEffectiveWeight(1).play();
    if (previous && previous !== next) { next.crossFadeFrom(previous, .22, false); retiring = previous === idle ? undefined : previous; retireAfter = .3; }
    foreground = next;
  }
  function readAgain() {
    if (!foreground) return;
    idle?.setEffectiveWeight(1).play();
    if (idle) foreground.crossFadeTo(idle, .32, false);
    retiring = foreground; retireAfter = .38; foreground = undefined;
  }
  mixer.addEventListener('finished', event => {
    if (event.action !== foreground) return;
    readAgain();
  });
  function update(time: number, dt: number, nextReduced: boolean) {
    if (reduced !== nextReduced) {
      reduced = nextReduced;
      if (reduced) { mixer.stopAllAction(); foreground = retiring = undefined; }
      else {
        idle?.reset().setEffectiveWeight(1).play();
        if (attended) play('Wave');
      }
    }
    if (!reduced) {
      mixer.update(dt);
      if (retiring) { retireAfter -= dt; if (retireAfter <= 0) { retiring.stop(); retiring = undefined; } }
    }
    birds.forEach(({ object, rotation }, i) => {
      object.rotation.y = rotation.y + (reduced ? 0 : Math.sin(time * .62 + i * 2.3) * .13);
    });
  }
  return {
    update,
    hover(target: HoverTarget | null) {
      const value = target === 'bear';
      if (value && !attended) play('Wave');
      else if (!value && attended) readAgain();
      attended = value;
    },
    state() { return reduced ? 'still' : foreground?.getClip().name ?? 'Idle'; },
    poses() {
      return Object.fromEntries(['Bear_Head', 'Bear_Arm_R', 'Bear_Book', 'Bear_Book_Page'].flatMap(name => {
        const object = root.getObjectByName(name);
        return object ? [[name, { rotation: object.rotation.toArray().slice(0, 3), scale: object.scale.toArray() }]] : [];
      }));
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
}

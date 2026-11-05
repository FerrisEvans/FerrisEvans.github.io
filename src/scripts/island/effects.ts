import {
  Box3, BoxGeometry, CylinderGeometry, Group,
  MathUtils, Mesh, MeshStandardMaterial, Object3D, PointLight, SphereGeometry,
  Vector3, type Camera, type Scene,
} from 'three';
import { hoverTargets, type HoverTarget } from './types';
import { createFountain } from './fountain';

/** Each response belongs to the object: flowing water, a page, foliage, a wag,
 * or music. Nothing scales/explodes the whole island. Pivots are authored in the
 * Blender source; transient effects are separate from navigation/picking bounds. */
export function createEffects(root: Object3D, scene: Scene, camera: Camera) {
  let active: HoverTarget | null = null, reduced = true;
  const strength = Object.fromEntries(hoverTargets.map(view => [view, 0])) as Record<HoverTarget, number>;
  const parts = new Map<string, { object: Object3D; position: Vector3; rotation: Object3D['rotation'] }>();
  for (const name of ['Library_FeatureBook', 'Desk_Page', 'Desk_Lamp', 'Radio',
    'Plants_Monstera_Foliage', 'Plants_Sansevieria_Foliage', 'Plants_Pothos_Foliage']) {
    const object = root.getObjectByName(name);
    if (object) parts.set(name, { object, position: object.position.clone(), rotation: object.rotation.clone() });
  }
  const at = (name: string, fallback: string) => {
    const anchor = root.getObjectByName(name);
    if (anchor) return anchor.getWorldPosition(new Vector3());
    const object = root.getObjectByName(fallback);
    return object ? new Box3().setFromObject(object).getCenter(new Vector3()) : new Vector3();
  };
  function rotate(name: string, axis: 'x' | 'y' | 'z', amount: number) {
    const part = parts.get(name); if (part) part.object.rotation[axis] = part.rotation[axis] + amount;
  }
  function move(name: string, axis: 'x' | 'y' | 'z', amount: number) {
    const part = parts.get(name); if (part) part.object.position[axis] = part.position[axis] + amount;
  }

  const fountainOrigin = at('Fountain_WaterAnchor', 'Categories');
  const basinAnchor = root.getObjectByName('Fountain_BasinAnchor');
  const basinY = basinAnchor ? basinAnchor.getWorldPosition(new Vector3()).y + .005 - fountainOrigin.y : -.6591;
  const fountain = createFountain(fountainOrigin, basinY);
  const { water } = fountain; scene.add(water);

  const notes = new Group(); notes.name = 'Hover_RadioNotes';
  notes.position.copy(at('Radio_NoteAnchor', 'Mailbox')); notes.visible = false; scene.add(notes);
  const noteMaterial = new MeshStandardMaterial({ color: '#e3ae65', roughness: .7, emissive: '#9f703d', emissiveIntensity: .3 });
  const noteHead = new SphereGeometry(1, 12, 8), noteStem = new CylinderGeometry(.017, .017, .31, 7), noteBar = new BoxGeometry(.18, .045, .04);
  const symbols = Array.from({ length: 3 }, (_, i) => {
    const symbol = new Group();
    for (const x of i === 1 ? [-.08, .1] : [0]) {
      const head = new Mesh(noteHead, noteMaterial); head.scale.set(.09, .06, .04); head.position.set(x, 0, 0); head.rotation.z = .2;
      const stem = new Mesh(noteStem, noteMaterial); stem.position.set(x + .07, .145, 0); symbol.add(head, stem);
    }
    const bar = new Mesh(noteBar, noteMaterial); bar.position.set(i === 1 ? .08 : .14, .29, 0); bar.rotation.z = -.12; symbol.add(bar);
    notes.add(symbol); return symbol;
  });
  const lamp = new PointLight('#ffe3a0', 0, 2.8, 2);
  lamp.position.copy(at('Desk_LightAnchor', 'Desk_Lamp')).add(new Vector3(0,.08,0)); scene.add(lamp);

  function update(time: number, dt: number, nextReduced: boolean) {
    reduced = nextReduced;
    for (const view of hoverTargets) strength[view] = reduced ? Number(active === view) : MathUtils.damp(strength[view], Number(active === view), 7, dt);
    const library = strength.library, desk = strength.recent, plants = strength.tags, radio = strength.mail;
    move('Library_FeatureBook', 'z', library * .16);
    rotate('Library_FeatureBook', 'z', library * -.075);
    rotate('Desk_Page', 'z', reduced ? 0 : desk * (.7 + .35 * Math.sin(time * 2.2)));
    lamp.intensity = desk * 2.4;
    for (const [i, name] of ['Plants_Monstera_Foliage', 'Plants_Sansevieria_Foliage', 'Plants_Pothos_Foliage'].entries()) {
      rotate(name, 'z', reduced ? 0 : plants * Math.sin(time * 3 + i) * .035);
      rotate(name, 'x', reduced ? 0 : plants * Math.cos(time * 2.1 + i) * .02);
    }
    rotate('Radio', 'z', reduced ? 0 : radio * Math.sin(time * 8) * .035);
    fountain.update(time, strength.categories, reduced);
    notes.visible = !reduced && radio > .008;
    if (notes.visible) symbols.forEach((note, i) => {
      const t = (time * .6 + i / 3) % 1;
      note.position.set(Math.sin(t * 4 + i) * .18, .2 + t * .8, 0);
      note.quaternion.copy(camera.quaternion); note.rotateZ(Math.sin(time * 2 + i) * .17);
      note.scale.setScalar(radio * Math.sin(t * Math.PI) * .9);
    });
  }
  return {
    update,
    hover(view: HoverTarget | null) { active = view; },
    state() { return { active, strength: { ...strength }, fountainVisible: water.visible, notesVisible: notes.visible, lampIntensity: lamp.intensity, reduced, pivots: [...parts.keys()] }; },
  };
}

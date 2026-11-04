import {
  Box3, BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, InstancedMesh,
  MathUtils, Mesh, MeshStandardMaterial, Object3D, PointLight, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3, type Camera, type Scene,
} from 'three';
import { hoverTargets, type HoverTarget } from './types';

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

  const water = new Group(); water.name = 'Hover_FountainWater';
  water.position.copy(at('Fountain_WaterAnchor', 'Categories')); water.visible = false; scene.add(water);
  const basinAnchor = root.getObjectByName('Fountain_BasinAnchor');
  const basinY = basinAnchor ? basinAnchor.getWorldPosition(new Vector3()).y + .005 - water.position.y : -.6591;
  const waterMaterial = new MeshStandardMaterial({ color: '#48bed4', roughness: .22, metalness: .02, emissive: '#24889d', emissiveIntensity: .16, transparent: true, opacity: .94, depthWrite: false });
  const jetCurve = new CatmullRomCurve3([new Vector3(), new Vector3(.015,.55,0), new Vector3(0,1.15,0), new Vector3(.025,1.28,.015)]);
  water.add(new Mesh(new TubeGeometry(jetCurve, 18, .048, 7, false), waterMaterial));
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const points = Array.from({ length: 17 }, (_, k) => {
      const t = k / 16, r = .86 * t;
      return new Vector3(Math.cos(a) * r, 3.6 * t * (1 - t) + basinY * t, Math.sin(a) * r);
    });
    water.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 18, .023, 6, false), waterMaterial));
  }
  const drops = new InstancedMesh(new SphereGeometry(.041, 8, 6), waterMaterial, 30);
  drops.name = 'Fountain_Droplets'; water.add(drops); const dummy = new Object3D();
  const ringMaterial = new MeshStandardMaterial({ color: '#d7f4ef', emissive: '#7cced5', emissiveIntensity: .2, transparent: true, opacity: .65, depthWrite: false });
  // The six splash rings sit at the stream landings on the lower basin's
  // authored water surface (world Y .805), clear of its central pedestal.
  const rings = Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    const mesh = new Mesh(new TorusGeometry(.065, .008, 5, 24), ringMaterial);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(Math.cos(a) * .86, basinY, Math.sin(a) * .86); water.add(mesh); return mesh;
  });

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
    water.visible = !reduced && strength.categories > .008;
    // Fade the flow without moving its contact points off the two water levels.
    waterMaterial.opacity = .94 * strength.categories;
    ringMaterial.opacity = .65 * strength.categories;
    if (water.visible) {
      for (let i = 0; i < 30; i++) {
        const t = (time * .8 + i / 30) % 1, a = i % 6 * Math.PI / 3;
        const r = .86 * t;
        dummy.position.set(Math.cos(a) * r, 4.2 * t * (1 - t) + basinY * t, Math.sin(a) * r);
        dummy.scale.setScalar(.65 + Math.sin(i * 7) * .22); dummy.scale.y *= 1.55; dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
      rings.forEach((ring, i) => { const s = .3 + ((time * .9 + i / 6) % 1) * 2.4; ring.scale.set(s, s, 1); });
    }
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

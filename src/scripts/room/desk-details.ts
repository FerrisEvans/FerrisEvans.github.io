import {
  Box3, CanvasTexture, Color, DoubleSide, Group, LatheGeometry,
  Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion,
  ShaderMaterial, SRGBColorSpace, Vector2, Vector3,
} from 'three';
import { createObjectContact } from './object-contact';

type Resources = Set<{ dispose(): void }>;
type CameraPose = { position: Vector3; quaternion?: Quaternion };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Initialize after createProps and before either static batching pass.
 * Owns Mug_* transforms and the pager's feedback; do not also props.nudge them.
 */
export function createDeskDetails(root: Object3D, resources: Resources) {
  const own = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
  const dynamic = (object: Object3D) => {
    object.userData.roomDynamic = true;
    object.userData.keepIndependent = true;
  };
  root.updateMatrixWorld(true);
  const body = root.getObjectByName('Mug_Body');
  const opening = root.getObjectByName('Mug_Opening');
  const cup = new Group(); cup.name = 'Coffee_Sip'; dynamic(cup);
  const cupBounds = body ? new Box3().setFromObject(body) : new Box3(new Vector3(-.835, .685, .675), new Vector3(-.565, 1.005, .945));
  const center = cupBounds.getCenter(new Vector3());
  const dimensions = cupBounds.getSize(new Vector3());
  const radius = Math.min(dimensions.x, dimensions.z) / 2;
  const height = dimensions.y, inner = radius - .014;
  const mugParts: Object3D[] = [];
  root.traverse(object => { if (object.name.startsWith('Mug_')) mugParts.push(object); });
  cup.position.copy(root.worldToLocal(center.clone())); root.add(cup);
  mugParts.forEach(object => { cup.attach(object); dynamic(object); });
  const cupRest = { position: cup.position.clone(), quaternion: cup.quaternion.clone() };
  // The receiver bake omits the cup; this cue follows its distance from the desk.
  const syncCupContact = createObjectContact(root, body ?? cup, root.getObjectByName('Desk_Top'), resources, true);

  // The source cylinder has a solid top. A real interior prevents a lowered
  // coffee disk revealing a ceramic lid, and the outside silhouette is retained.
  const roomReflection = body instanceof Mesh && body.material instanceof MeshStandardMaterial ? body.material.envMap : null;
  const authoredInterior = body?.userData.ceramicInterior === true;
  // Current Blender cups already carry a hollow shell and baked stoneware.
  // Retain the runtime shell only as a compatibility path for older models.
  if (!authoredInterior) {
    const ceramic = own(new MeshStandardMaterial({ color: '#d6d0bd', roughness: .23, envMap: roomReflection, envMapIntensity: .7 }));
    for (const object of mugParts) if (object instanceof Mesh && object !== opening) object.material = ceramic;
  }
  if (body instanceof Mesh && !authoredInterior) {
    const profile = [
      [0, -height / 2], [radius - .005, -height / 2], [radius, -height / 2 + .007],
      [radius, height / 2 - .006], [radius - .004, height / 2],
      [inner + .003, height / 2], [inner, height / 2 - .005],
      [inner, -height / 2 + .018], [0, -height / 2 + .018],
    ].map(([x, y]) => new Vector2(x, y));
    const geometry = own(new LatheGeometry(profile, 64));
    body.updateWorldMatrix(true, false);
    geometry.applyMatrix4(new Matrix4().makeTranslation(center.x, center.y, center.z));
    geometry.applyMatrix4(body.matrixWorld.clone().invert());
    body.geometry = geometry;
  }
  if (opening) opening.visible = false;
  const coffeeMaterial = own(new MeshPhysicalMaterial({ color: '#2c190c', roughness: .095, ior:1.33, specularIntensity:.85, envMap: roomReflection, envMapIntensity:.025 }));
  const meniscus=[new Vector2(inner-.001,.003),new Vector2(inner-.003,.001),new Vector2(inner-.008,0),new Vector2(0,0)];
  const liquid = new Mesh(own(new LatheGeometry(meniscus,96)), coffeeMaterial);
  liquid.name = 'Coffee_Liquid'; dynamic(liquid); cup.add(liquid);
  const fullY = height / 2 - .016, drain = Math.max(0, height - .045);
  liquid.position.y = fullY;

  const steamMaterial = own(new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: `uniform float time; varying vec2 vUv;
      void main(){vUv=uv;vec3 p=position;
        p.x+=sin(uv.y*7.0-time*1.4)*.012*uv.y;
        p.z+=sin(uv.y*5.0-time*.9)*.008*uv.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader: `uniform float time,strength; varying vec2 vUv;
      void main(){float bend=.5+sin(vUv.y*8.0-time*1.4)*.10;
        float wisps=exp(-pow((vUv.x-bend)*5.5,2.0));
        float ends=smoothstep(0.0,.16,vUv.y)*(1.0-smoothstep(.58,1.0,vUv.y));
        float drift=.65+.35*sin(vUv.y*15.0-time*1.8);
        gl_FragColor=vec4(.72,.75,.77,wisps*ends*drift*strength);}`,
  }));
  const steam = new Group(); steam.name = 'Coffee_Steam'; dynamic(steam); cup.add(steam);
  const steamGeometry = own(new PlaneGeometry(.052, .22, 4, 12));
  for (let i = 0; i < 3; i++) {
    const wisp = new Mesh(steamGeometry, steamMaterial); dynamic(wisp);
    wisp.position.set((i - 1) * .025, height / 2 + .105 + (i % 2) * .025, (i - 1) * .016);
    wisp.rotation.y = (i - 1) * .55;
    steam.add(wisp);
  }
  steam.visible = false;

  // Only LCD pixels receive emission. Printed case labels retain their own ink.
  const pager = root.getObjectByName('Desk_Pager_Motion') ?? root.getObjectByName('Desk_Pager');
  const lcd = root.getObjectByName('Desk_Pager_LCD');
  const oldDigits = root.getObjectByName('Desk_Pager_Print_Digits');
  const pagerRest = pager ? { position: pager.position.clone(), quaternion: pager.quaternion.clone() } : null;
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 128;
  const context = canvas.getContext('2d');
  const lcdMap = own(new CanvasTexture(canvas)); lcdMap.colorSpace = SRGBColorSpace;
  const lcdMaterial = own(new MeshStandardMaterial({ map: lcdMap, roughness: .66, emissive: new Color('#d4efb6'), emissiveMap: lcdMap, emissiveIntensity: 0 }));
  if (lcd instanceof Mesh) {
    lcd.geometry = own(new PlaneGeometry(.130, .064).rotateX(-Math.PI / 2).translate(0, .0018, 0));
    lcd.material = lcdMaterial; dynamic(lcd);
  }
  if (oldDigits) { oldDigits.visible = false; dynamic(oldDigits); }
  const messages = ['ONE MORE LOOP', 'NOTES SAVED', 'TAKE A BREATH'];
  let pages = 0, sips = 0, level = 1, targetLevel = 1, sipStart: number | null = null;
  let pagerStart = -Infinity, pagerLight = 0, lastTime = 0, motionEnabled = false;
  const sipTravel = new Vector3(0, .24, .16), tiltAxis = new Vector3(1, 0, 0);
  const tilt = new Quaternion();
  function paintPager() {
    if (!context) return;
    context.fillStyle = '#889a70'; context.fillRect(0, 0, 320, 128);
    context.fillStyle = '#26372a';
    context.font = 'bold 22px monospace'; context.fillText(pages ? messages[(pages - 1) % messages.length] : 'READY', 14, 36);
    context.font = 'bold 46px monospace'; context.fillText(pages ? `LOOP ${String(pages).padStart(2, '0')}` : '00:00', 14, 96);
    lcdMap.needsUpdate = true;
  }
  paintPager();
  function sip(time: number, camera?: CameraPose, reduced = false) {
    if (!body || sipStart !== null || sips >= 7) return false;
    sips++; targetLevel = Math.max(0, 1 - sips / 7);
    const direction = camera ? root.worldToLocal(camera.position.clone()).sub(cupRest.position) : new Vector3(0, 0, 1);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, 1);
    direction.normalize(); sipTravel.copy(direction).multiplyScalar(.18); sipTravel.y = .24;
    tiltAxis.crossVectors(new Vector3(0, 1, 0), direction).normalize();
    if (reduced) { level = targetLevel; liquid.position.y = fullY - drain * (1 - level); liquid.visible = level > .001; steam.visible = false; }
    else sipStart = time;
    return true;
  }
  function page(time: number) {
    if (!pager) return false;
    pages++; pagerStart = time; pagerLight = 1;
    paintPager(); lcdMaterial.emissiveIntensity = 1.15;
    return true;
  }
  function update(time: number, motion: boolean, dt: number) {
    lastTime = time; motionEnabled = motion;
    cup.position.copy(cupRest.position); cup.quaternion.copy(cupRest.quaternion);
    let amount = 0;
    if (sipStart !== null) {
      const age = Math.max(0, time - sipStart);
      amount = age < .7 ? smooth(age / .7) : age < 1.15 ? 1 : 1 - smooth((age - 1.15) / .85);
      if (!motion || age >= 2) { sipStart = null; amount = 0; level = targetLevel; }
      else {
        cup.position.addScaledVector(sipTravel, amount);
        tilt.setFromAxisAngle(tiltAxis, .18 * smooth((age - .4) / .4) * amount);
        cup.quaternion.multiply(tilt);
      }
      if (age > .5) level += (targetLevel - level) * (1 - Math.exp(-Math.max(0, dt) * 7));
    }
    liquid.position.y = fullY - drain * (1 - level);
    liquid.visible = level > .001;
    // A small counter-rotation keeps the coffee surface level while sipping.
    liquid.quaternion.copy(cup.quaternion).invert();
    steam.quaternion.copy(cup.quaternion).invert();
    steam.visible = motion && level > .015 && Boolean(body);
    steamMaterial.uniforms.time.value = time;
    steamMaterial.uniforms.strength.value = motion ? .075 * level * (1 - amount * .75) : 0;
    const age = Math.max(0, time - pagerStart);
    pagerLight = age < 1 ? 1 : Math.exp(-(age - 1) * 1.25);
    if (pagerLight < .002) pagerLight = 0;
    lcdMaterial.emissiveIntensity = pagerLight * 1.15;
    if (pager && pagerRest) {
      pager.position.copy(pagerRest.position); pager.quaternion.copy(pagerRest.quaternion);
      if (motion && age < .9) {
        const decay = Math.exp(-age * 5);
        pager.position.x += Math.sin(age * 91) * .004 * decay;
        pager.position.z += Math.sin(age * 73) * .0017 * decay;
        pager.rotateY(Math.sin(age * 85) * .012 * decay);
      }
    }
    root.updateMatrixWorld(true);
    syncCupContact();
  }
  function reset() {
    sips = pages = 0; level = targetLevel = 1; sipStart = null; pagerStart = -Infinity; pagerLight = 0;
    cup.position.copy(cupRest.position); cup.quaternion.copy(cupRest.quaternion);
    liquid.position.y = fullY; liquid.visible = true; liquid.quaternion.identity(); steam.quaternion.identity(); steam.visible = false;
    steamMaterial.uniforms.strength.value = 0; lcdMaterial.emissiveIntensity = 0;
    if (pager && pagerRest) { pager.position.copy(pagerRest.position); pager.quaternion.copy(pagerRest.quaternion); }
    paintPager();
    syncCupContact();
  }
  return {
    sip, page, update, reset,
    get moving() { return sipStart !== null || pagerLight > .002 || (motionEnabled && lastTime - pagerStart < .9); },
    getstate: () => ({ sips, level, empty: sips >= 7, sipping: sipStart !== null, steam: steam.visible ? level : 0, pages, pagerLit: pagerLight }),
  };
}

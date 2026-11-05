import {
  BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, MathUtils,
  Mesh, MeshStandardMaterial, Object3D, SphereGeometry, TorusGeometry, Vector3,
} from 'three';

/** Water keeps its authored contact points. Only the plume breathes; scaling
 * the entire effect would lift the landing ripples out of the lower basin. */
export function createFountain(origin: Vector3, basinY: number) {
  const water = new Group();
  water.name = 'Hover_FountainWater'; water.position.copy(origin); water.visible = false;
  const material = new MeshStandardMaterial({
    color: '#8bd1d9', roughness: .25, metalness: 0,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const beadMaterial = new MeshStandardMaterial({
    color: '#c5e8e5', roughness: .2, metalness: 0,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const plumeMaterial = material.clone(); plumeMaterial.color.set('#a5dcdf');
  const up = new Vector3(0, 1, 0);
  const point = new Vector3(), tangent = new Vector3();

  // Both geometry and moving beads sample the same ballistic path. The old
  // effect used different curves, making drops visibly float off their jets.
  const landingRadius = .84;
  function arc(t: number, angle: number, target: Vector3) {
    const radius = .11 + (landingRadius - .11) * t;
    return target.set(Math.cos(angle) * radius, basinY * t + 2.75 * t * (1 - t), Math.sin(angle) * radius);
  }
  function arcTangent(t: number, angle: number, target: Vector3) {
    return target.set(Math.cos(angle) * (landingRadius - .11), basinY + 2.75 * (1 - 2 * t), Math.sin(angle) * (landingRadius - .11)).normalize();
  }
  function taperedTube(sample: (t: number, target: Vector3) => Vector3, startRadius: number, endRadius: number) {
    const segments = 36, sides = 8;
    const positions: number[] = [], indices: number[] = [];
    const centre = new Vector3(), next = new Vector3(), direction = new Vector3();
    const side = new Vector3(), normal = new Vector3();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      sample(t, centre);
      sample(Math.min(1, t + .001), next);
      if (i === segments) { sample(t - .001, next); direction.subVectors(centre, next); }
      else direction.subVectors(next, centre);
      direction.normalize();
      side.set(0, 0, 1).cross(direction).normalize(); normal.crossVectors(direction, side).normalize();
      const radius = MathUtils.lerp(startRadius, endRadius, Math.pow(t, .7));
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        positions.push(
          centre.x + radius * (side.x * Math.cos(a) + normal.x * Math.sin(a)),
          centre.y + radius * (side.y * Math.cos(a) + normal.y * Math.sin(a)),
          centre.z + radius * (side.z * Math.cos(a) + normal.z * Math.sin(a)),
        );
        if (i < segments && j < sides) {
          const v = i * (sides + 1) + j;
          indices.push(v, v + 1, v + sides + 1, v + 1, v + sides + 2, v + sides + 1);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  const plume = new Mesh(taperedTube((t, target) => target.set(.012 * Math.sin(t * Math.PI), .8 * t, .008 * t * t), .028, .005), plumeMaterial);
  plume.name = 'Fountain_CentrePlume'; water.add(plume);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + .2;
    const stream = new Mesh(taperedTube((t, target) => arc(t, angle, target), .017, .008), material);
    stream.name = `Fountain_Stream_${i}`; water.add(stream);
  }

  const drops = new InstancedMesh(new SphereGeometry(1, 10, 8), beadMaterial, 42);
  drops.name = 'Fountain_Droplets';
  // Instances begin at the emitter and subsequently travel to the lower bowl;
  // their initial bounding sphere would otherwise exclude the moving beads.
  drops.frustumCulled = false; water.add(drops);
  const dummy = new Object3D();
  const ringGeometry = new TorusGeometry(1, .028, 5, 40);
  const rings = Array.from({ length: 7 }, (_, i) => {
    const ringMaterial = new MeshStandardMaterial({
      color: '#d4eae3', roughness: .65, transparent: true, opacity: 0, depthWrite: false,
    });
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.name = `Fountain_Ripple_${i}`; ring.rotation.x = -Math.PI / 2;
    const angle = i * Math.PI / 3 + .2;
    ring.position.set(i < 6 ? Math.cos(angle) * landingRadius : 0, i < 6 ? basinY : .006, i < 6 ? Math.sin(angle) * landingRadius : 0);
    water.add(ring); return ring;
  });

  function update(time: number, intensity: number, reduced: boolean) {
    water.visible = !reduced && intensity > .008;
    if (!water.visible) return;
    material.opacity = .62 * intensity;
    plumeMaterial.opacity = .7 * intensity;
    beadMaterial.opacity = .84 * intensity;
    const breath = 1 + .025 * Math.sin(time * 2.1);
    plume.scale.y = breath;
    for (let i = 0; i < 42; i++) {
      let t: number, radius: number;
      if (i < 36) {
        const stream = Math.floor(i / 6), angle = stream * Math.PI / 3 + .2;
        t = (time * .78 + (i % 6) / 6 + stream * .073) % 1;
        arc(t, angle, point); arcTangent(t, angle, tangent);
        radius = .013 + .007 * Math.sin(t * Math.PI);
      } else {
        // Small droplets peel off the plume and fall into the upper bowl,
        // whose measured water radius is .339 (lower bowl: 1.043).
        t = (time * .88 + (i - 36) / 6) % 1;
        const angle = (i - 36) * Math.PI / 3 + .3;
        point.set(.25 * t * Math.cos(angle), .8 * breath * (1 - t * t), .008 * (1 - t) + .25 * t * Math.sin(angle));
        tangent.set(.25 * Math.cos(angle), -1.6 * breath * t, .25 * Math.sin(angle) - .008).normalize();
        radius = .014;
      }
      // Taper at emission/landing hides particle wrapping instead of popping.
      const envelope = Math.min(1, t * 12, (1 - t) * 14);
      dummy.position.copy(point); dummy.quaternion.setFromUnitVectors(up, tangent);
      dummy.scale.set(radius * envelope, radius * envelope * 1.7, radius * envelope);
      dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
    rings.forEach((ring, i) => {
      const phase = (time * .9 + i * .173) % 1;
      const radius = i < 6 ? .022 + phase * .13 : .025 + phase * .25;
      ring.scale.setScalar(radius);
      // Each ripple becomes invisible before resetting to its smallest size.
      ring.material.opacity = intensity * .52 * Math.sin(phase * Math.PI) ** 2;
    });
  }
  return { water, update };
}

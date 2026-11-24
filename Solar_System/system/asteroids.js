import * as THREE from 'three';
import { AU_KM, DAY_MS, YEAR_DAYS } from './data.js';

// Reproducible illustrative population, NOT a catalog of observed asteroids.
export function seededRandom(seed = 20261123) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function createPopulation(count = 1600) {
  const random = seededRandom();
  return Array.from({ length: count }, () => {
    let a;
    do { a = 2.1 + random() * 1.2; }
    while ([2.50, 2.82, 2.95].some(gap => Math.abs(a - gap) < 0.022));
    return {
      a, e: 0.025 + random() * 0.13, i: random() ** 2 * 0.25,
      node: random() * Math.PI * 2, peri: random() * Math.PI * 2,
      anomaly: random() * Math.PI * 2, radius: 0.5 + random() ** 5 * 49.5,
      phase: random() * Math.PI * 2,
    };
  });
}
export function asteroidPosition(rock, milliseconds) {
  const d = (milliseconds - Date.UTC(2000, 0, 1, 12)) / DAY_MS;
  const M = (rock.anomaly + d * Math.PI * 2 / (YEAR_DAYS * rock.a ** 1.5)) % (Math.PI * 2);
  let E = M;
  for (let k = 0; k < 5; k++) E -= (E - rock.e * Math.sin(E) - M) / (1 - rock.e * Math.cos(E));
  const x = rock.a * (Math.cos(E) - rock.e);
  const y = rock.a * Math.sqrt(1 - rock.e ** 2) * Math.sin(E);
  const cp = Math.cos(rock.peri), sp = Math.sin(rock.peri);
  const cn = Math.cos(rock.node), sn = Math.sin(rock.node);
  const ci = Math.cos(rock.i), si = Math.sin(rock.i);
  const u = cp * x - sp * y, v = sp * x + cp * y;
  return new THREE.Vector3(cn * u - sn * v * ci, v * si, -(sn * u + cn * v * ci));
}

export function createAsteroidBelt() {
  const rocks = createPopulation();
  const group = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const attribute = geometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(attribute, i);
    // Continuous deformation keeps duplicate edge vertices joined.
    const f = 0.86 + 0.13 * Math.sin(p.x * 8 + p.y * 4) * Math.cos(p.z * 7 - p.y * 3);
    attribute.setXYZ(i, p.x * f, p.y * f * 0.76, p.z * f * 0.89);
  }
  geometry.computeVertexNormals();
  // Code-native rock texture: multiscale 3D grain, not an AI raster image.
  const material = new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 rockPoint;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nrockPoint = position;');
    shader.fragmentShader = 'varying vec3 rockPoint;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = sin(rockPoint.x * 83.) * sin(rockPoint.y * 71.) * sin(rockPoint.z * 97.);
        float strata = sin(rockPoint.x * 13. + sin(rockPoint.y * 17.) * 1.3 + rockPoint.z * 9.);
        diffuseColor.rgb *= .68 + .18 * strata + .12 * grain;`);
  };
  const mesh = new THREE.InstancedMesh(geometry, material, rocks.length);
  mesh.frustumCulled = false;
  group.add(mesh);
  const markerGeometry = new THREE.BufferGeometry();
  const markerPositions = new Float32Array(rocks.length * 3);
  markerGeometry.setAttribute('position', new THREE.BufferAttribute(markerPositions, 3));
  const markers = new THREE.Points(markerGeometry, new THREE.PointsMaterial({
    color: 0xa99d87, size: 1.25, sizeAttenuation: false, transparent: true,
    opacity: 0.32, depthWrite: false,
  }));
  markers.frustumCulled = false;
  group.add(markers);
  const dummy = new THREE.Object3D();
  const update = (milliseconds, origin) => {
    rocks.forEach((rock, i) => {
      dummy.position.copy(asteroidPosition(rock, milliseconds)).sub(origin);
      dummy.scale.setScalar(rock.radius / AU_KM); // Actual rock radii, never display-enlarged.
      dummy.rotation.set(rock.phase, rock.phase * 1.7, rock.phase * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.position.toArray(markerPositions, i * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    markerGeometry.attributes.position.needsUpdate = true;
  };
  return { group, markers, update };
}

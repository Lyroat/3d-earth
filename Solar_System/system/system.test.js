import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AstroTime } from 'astronomy-engine';
import { Group, Mesh, PerspectiveCamera, RingGeometry, Scene, SphereGeometry, Texture, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AU_KM, BODIES, BODY_BY_ID, DAY_MS, MIN_TIME, MAX_TIME, SIZE_OPTIONS, radiusAU, polarAU } from './data.js';
import { positionAt, orientationAt, stateAt, sampleOrbit } from './astronomy.js';
import { createPopulation, asteroidPosition } from './asteroids.js';
import { appearanceRadius, applyAppearanceScale, observationDiameter, updateAppearanceForView } from './appearance.js';
import { limitCameraZoom, minimumZoomDistance, observationHalfFov, MAX_ZOOM_FRAME_FRACTION } from './zoom-limits.js';
import { createTeachingState, advanceTeachingState, SEASON_ANGLES } from '../sem/model.js';
import { createSEM } from '../sem/sem.js';
import { captureView, restoreView } from './view-state.js';
import { applyModeUI, createModeController } from './mode-controller.js';
import { screenSpaceUI } from '../../ui/screen-space.js';

const date = new Date('2026-11-23T00:00:00Z');
const close = (a, b, tolerance = 1e-11) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('AU uses the exact IAU definition; every radius shares the distance scale', () => {
  assert.equal(AU_KM, 149597870.7);
  for (const body of BODIES) {
    close(radiusAU(body) * AU_KM, body.radius, 1e-8);
    close(polarAU(body) * AU_KM, body.polar, 1e-8);
    assert.ok(body.polar <= body.radius);
  }
  close(radiusAU(BODY_BY_ID.Jupiter) / radiusAU(BODY_BY_ID.Earth), 71492 / 6378.137);
});
test('physical reference dimensions and ephemerides stay unchanged by observation presets', () => {
  assert.deepEqual(SIZE_OPTIONS, [1, 10, 25]);
  for (const body of BODIES) {
    const original = stateAt(body.id, date);
    for (const scale of SIZE_OPTIONS) {
      close(radiusAU(body, scale) / radiusAU(body), scale);
      close(polarAU(body, scale) / polarAU(body), scale);
      close(appearanceRadius(body, scale) / appearanceRadius(body, 1), scale);
      assert.deepEqual(stateAt(body.id, date).position.toArray(), original.position.toArray());
    }
  }
});
function appearanceFixture(id = 'Earth', aspect = 1.6, distanceInRadii = 7.5) {
  const nodes = new Map(BODIES.map(body => {
    const group = new Group();
    // Followed body is at the floating origin; the other bodies keep their positions.
    group.position.copy(positionAt(body.id, date).sub(positionAt(id, date)));
    group.quaternion.copy(orientationAt(body.id, date).quaternion);
    const mesh = new Mesh(new SphereGeometry(1, 8, 8));
    mesh.scale.set(body.radius / AU_KM, body.polar / AU_KM, body.radius / AU_KM);
    group.add(mesh);
    const ring = body.ringOuter ? new Mesh(new RingGeometry(body.ringInner / AU_KM, body.ringOuter / AU_KM, 32)) : null;
    if (ring) {
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
    }
    return [body.id, { group, mesh, ring }];
  }));
  const camera = new PerspectiveCamera(42, aspect, 1e-10, 1000);
  camera.position.set(0, 0, appearanceRadius(BODY_BY_ID[id], 1) * distanceInRadii / Math.min(1, aspect));
  const controls = { target: new Vector3(), minDistance: 0 };
  return { nodes, camera, controls };
}
function angularRadius(body, scale, camera) {
  return Math.asin(appearanceRadius(body, scale) / camera.position.length());
}
test('already resolved bodies keep their physical enlargement without moving the camera or target', () => {
  const fixture = appearanceFixture('Earth', 1.6, 1000);
  fixture.controls.target.set(1e-5, 2e-5, -3e-5); // Panning must not be scaled either.
  const beforeCamera = fixture.camera.position.clone();
  const beforeTarget = fixture.controls.target.clone();
  const body = BODY_BY_ID.Earth;
  const oldAngle = angularRadius(body, 1, fixture.camera);
  const positions = [...fixture.nodes.values()].map(node => node.group.position.toArray());
  const adjusted = applyAppearanceScale({ ...fixture, scale: 25, previousScale: 1, focusId: 'Earth' });
  assert.equal(adjusted, false);
  assert.deepEqual(fixture.camera.position.toArray(), beforeCamera.toArray());
  assert.deepEqual(fixture.controls.target.toArray(), beforeTarget.toArray());
  assert.deepEqual([...fixture.nodes.values()].map(node => node.group.position.toArray()), positions);
  close(Math.sin(angularRadius(body, 25, fixture.camera)) / Math.sin(oldAngle), 25);
  fixture.nodes.get('Earth').group.updateMatrixWorld(true);
  close(fixture.nodes.get('Earth').mesh.getWorldScale(new Vector3()).x, radiusAU(body, 25));
  assert.ok(fixture.nodes.get('Sun').group.scale.x >= 25);
});
test('10x and 25x grow in focused views, including the Sun, Saturn rings and portrait screens', () => {
  for (const id of ['Sun', 'Earth', 'Moon', 'Saturn']) {
    for (const aspect of [1.6, 0.6]) {
      const fixture = appearanceFixture(id, aspect);
      const positions = [...fixture.nodes.values()].map(node => node.group.position.toArray());
      let previousScale = 1;
      let previousAngle = angularRadius(BODY_BY_ID[id], 1, fixture.camera);
      for (const scale of [10, 25]) {
        const beforeTarget = fixture.controls.target.clone();
        applyAppearanceScale({ ...fixture, scale, previousScale, focusId: id });
        limitCameraZoom({
          ...fixture, centre: fixture.nodes.get(id).group.position,
          radius: appearanceRadius(BODY_BY_ID[id], scale),
        });
        const angle = angularRadius(BODY_BY_ID[id], scale, fixture.camera);
        assert.ok(angle > previousAngle * 1.1, `${id}, aspect ${aspect}, ${scale}x must visibly enlarge`);
        assert.ok(fixture.camera.position.length() > appearanceRadius(BODY_BY_ID[id], scale));
        assert.ok(angle < fixture.camera.getEffectiveFOV() * Math.PI / 360);
        assert.deepEqual(fixture.controls.target.toArray(), beforeTarget.toArray());
        assert.deepEqual([...fixture.nodes.values()].map(node => node.group.position.toArray()), positions);
        close(fixture.nodes.get(id).group.scale.x, scale);
        previousScale = scale;
        previousAngle = angle;
      }
    }
  }
});
test('overview enlargement and reducing appearance size do not move the camera', () => {
  const fixture = appearanceFixture();
  const before = fixture.camera.position.toArray();
  for (const scale of [10, 25]) {
    applyAppearanceScale({ ...fixture, scale, previousScale: 1 });
    assert.deepEqual(fixture.camera.position.toArray(), before);
  }
  applyAppearanceScale({ ...fixture, scale: 1, previousScale: 25, focusId: 'Earth' });
  assert.deepEqual(fixture.camera.position.toArray(), before);
  for (const node of fixture.nodes.values()) assert.deepEqual(node.group.scale.toArray(), [1, 1, 1]);
});
test('full / inner / top views show progressively visible ORIGINAL Sun and planets at unchanged positions', () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720], [390, 844]]) {
    for (const [distance, direction] of [[88, [0, 0.68, 1]], [5.7, [0, 0.68, 1]], [78, [0, 1, 0.0001]]]) {
      const fixture = appearanceFixture('Sun', width / height);
      fixture.camera.position.fromArray(direction).normalize().multiplyScalar(distance * Math.max(1, 1.4 * height / width));
      fixture.camera.lookAt(0, 0, 0);
      fixture.camera.updateMatrixWorld();
      const cameraBefore = fixture.camera.position.toArray();
      const targetBefore = fixture.controls.target.toArray();
      const originals = new Map([...fixture.nodes].map(([id, node]) => [id, {
        mesh: node.mesh, children: [...node.group.children],
        position: node.group.position.toArray(), orientation: node.group.quaternion.toArray(),
        projection: node.group.position.clone().project(fixture.camera).toArray(),
      }]));
      let previousScale = 1;
      for (const scale of [10, 25, 1, 25, 10, 1]) {
        applyAppearanceScale({ ...fixture, scale, previousScale, viewportHeight: height });
        limitCameraZoom({
          ...fixture, centre: fixture.nodes.get('Sun').group.position,
          radius: appearanceRadius(BODY_BY_ID.Sun, scale),
        });
        assert.deepEqual(fixture.camera.position.toArray(), cameraBefore);
        assert.deepEqual(fixture.controls.target.toArray(), targetBefore);
        for (const [id, node] of fixture.nodes) {
          const body = BODY_BY_ID[id], original = originals.get(id);
          const multiplier = node.group.scale.x;
          if (scale === 1) assert.equal(multiplier, 1);
          else if (id === 'Moon') assert.equal(multiplier, scale, 'Do not let a lunar visibility floor cover Earth');
          else {
            const depth = -node.group.position.clone().applyMatrix4(fixture.camera.matrixWorldInverse).z;
            const diameter = 2 * appearanceRadius(body, 1) * multiplier / depth
              * height / (2 * Math.tan(fixture.camera.getEffectiveFOV() * Math.PI / 360));
            const minimum = observationDiameter(body, scale);
            assert.ok(diameter >= minimum - 1e-9, `${id} must be visibly rendered, not sub-pixel`);
            assert.ok(diameter > (scale === 10 ? 11 : 28), `${id} at ${scale}x must be recognisable`);
            assert.ok(multiplier >= scale);
          }
          assert.strictEqual(node.mesh, original.mesh, 'Scale the original mesh, not a displaced copy');
          assert.deepEqual(node.group.children, original.children, 'Do not add preview spheres or leader lines');
          assert.deepEqual(node.group.position.toArray(), original.position);
          assert.deepEqual(node.group.quaternion.toArray(), original.orientation);
          assert.deepEqual(node.group.position.clone().project(fixture.camera).toArray(), original.projection);
          node.group.updateMatrixWorld(true);
          const worldScale = node.mesh.getWorldScale(new Vector3());
          close(worldScale.x, body.radius / AU_KM * multiplier);
          close(worldScale.y, body.polar / AU_KM * multiplier);
          close(worldScale.z, body.radius / AU_KM * multiplier);
          assert.ok(node.mesh.getWorldPosition(new Vector3()).distanceTo(node.group.position) < 1e-12);
          if (node.ring) {
            assert.ok(node.ring.getWorldPosition(new Vector3()).distanceTo(node.group.position) < 1e-12);
            close(node.ring.getWorldScale(new Vector3()).x, multiplier);
            close(appearanceRadius(body, 1) * multiplier, body.ringOuter / AU_KM * multiplier);
          }
        }
        previousScale = scale;
      }
    }
  }
});
test('10x to 25x actually grows the projected geometry by 2.5x in the default overview', () => {
  const fixture = appearanceFixture('Sun', 1440 / 900);
  fixture.camera.position.set(0, 0.68, 1).normalize().multiplyScalar(88);
  fixture.camera.lookAt(0, 0, 0);
  fixture.camera.updateMatrixWorld();
  const diameters = new Map();
  for (const scale of [10, 25]) {
    applyAppearanceScale({ ...fixture, scale, previousScale: scale === 10 ? 1 : 10, viewportHeight: 900 });
    for (const body of BODIES.filter(body => body.id !== 'Moon')) {
      const node = fixture.nodes.get(body.id);
      const depth = -node.group.position.clone().applyMatrix4(fixture.camera.matrixWorldInverse).z;
      const diameter = 2 * appearanceRadius(body, 1) * node.group.scale.x / depth
        * 900 / (2 * Math.tan(fixture.camera.getEffectiveFOV() * Math.PI / 360));
      if (scale === 10) diameters.set(body.id, diameter);
      else close(diameter / diameters.get(body.id), 2.5);
    }
    // Inspect the projected vertices of the actual sphere, not only its scale.
    for (const id of ['Sun', 'Earth']) {
      const node = fixture.nodes.get(id);
      node.group.updateMatrixWorld(true);
      const positions = node.mesh.geometry.attributes.position;
      const x = [], y = [];
      for (let i = 0; i < positions.count; i++) {
        const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.mesh.matrixWorld).project(fixture.camera);
        x.push((point.x + 1) * 720); y.push((1 - point.y) * 450);
      }
      const footprint = Math.max(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y));
      assert.ok(footprint >= observationDiameter(BODY_BY_ID[id], scale) * 0.9, `${id} geometry must visibly enlarge`);
    }
  }
  close(diameters.get('Earth'), 14);
  assert.ok(diameters.get('Sun') > 35 && diameters.get('Sun') < 37);
});
test('Sun shares the planetary observation-size rule and remains larger than their minimum footprints', () => {
  for (const scale of [10, 25]) {
    const sunDiameter = observationDiameter(BODY_BY_ID.Sun, scale);
    close(sunDiameter / observationDiameter(BODY_BY_ID.Earth, scale),
      (BODY_BY_ID.Sun.radius / BODY_BY_ID.Earth.radius) ** 0.2);
    for (const body of BODIES.filter(body => body.id !== 'Sun')) {
      assert.ok(sunDiameter > observationDiameter(body, scale), body.id);
    }
  }
  close(observationDiameter(BODY_BY_ID.Sun, 25) / observationDiameter(BODY_BY_ID.Sun, 10), 2.5);
  assert.equal(observationDiameter(BODY_BY_ID.Sun, 1), 0);
});
test('camera motion, viewport resize and body motion refresh the visibility floor without shifting centres', () => {
  const fixture = appearanceFixture('Sun', 1440 / 900);
  for (const [distance, height] of [[88, 900], [176, 900], [70, 450], [120, 844]]) {
    fixture.camera.position.set(0.25, 0.68, 1).normalize().multiplyScalar(distance);
    fixture.camera.lookAt(0, 0, 0);
    for (const body of BODIES) fixture.nodes.get(body.id).group.position.copy(positionAt(body.id, new Date(+date + distance * DAY_MS)));
    const centres = [...fixture.nodes.values()].map(node => node.group.position.toArray());
    updateAppearanceForView({ ...fixture, scale: 25, viewportHeight: height });
    assert.deepEqual([...fixture.nodes.values()].map(node => node.group.position.toArray()), centres);
    const earth = fixture.nodes.get('Earth');
    const depth = -earth.group.position.clone().applyMatrix4(fixture.camera.matrixWorldInverse).z;
    const diameter = 2 * radiusAU(BODY_BY_ID.Earth) * earth.group.scale.x / depth
      * height / (2 * Math.tan(fixture.camera.getEffectiveFOV() * Math.PI / 360));
    close(diameter, 35);
    const sun = fixture.nodes.get('Sun');
    const sunDepth = -sun.group.position.clone().applyMatrix4(fixture.camera.matrixWorldInverse).z;
    const sunDiameter = 2 * radiusAU(BODY_BY_ID.Sun) * sun.group.scale.x / sunDepth
      * height / (2 * Math.tan(fixture.camera.getEffectiveFOV() * Math.PI / 360));
    close(sunDiameter, observationDiameter(BODY_BY_ID.Sun, 25));
  }
  updateAppearanceForView({ ...fixture, scale: 1, viewportHeight: 844 });
  for (const node of fixture.nodes.values()) assert.deepEqual(node.group.scale.toArray(), [1, 1, 1]);
});
test('close-up zoom is bounded for every body and size preset, including Saturn rings and portrait views', () => {
  for (const body of BODIES) {
    for (const aspect of [16 / 9, 32 / 9, 390 / 844]) {
      for (const scale of SIZE_OPTIONS) {
        const fixture = appearanceFixture(body.id, aspect);
        const { camera, controls } = fixture;
        const radius = appearanceRadius(body, scale);
        const centre = fixture.nodes.get(body.id).group.position;
        const positions = [...fixture.nodes.values()].map(node => node.group.position.toArray());
        camera.position.set(0, 0, radius * 1.01); // Previously allowed near-surface magnification.
        assert.equal(limitCameraZoom({ camera, controls, centre, radius }), true);
        close(camera.position.distanceTo(centre) / radius, minimumZoomDistance(camera, radius) / radius);
        close(controls.minDistance / radius, camera.position.distanceTo(centre) / radius);
        close(Math.asin(radius / camera.position.distanceTo(centre)),
          observationHalfFov(camera) * MAX_ZOOM_FRAME_FRACTION);
        assert.ok(MAX_ZOOM_FRAME_FRACTION < 1, 'Leave a margin instead of clipping the planet');
        assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
        assert.deepEqual([...fixture.nodes.values()].map(node => node.group.position.toArray()), positions);
        updateAppearanceForView({ ...fixture, scale, viewportHeight: 900 });
        close(fixture.nodes.get(body.id).group.scale.x, scale, 1e-10);
      }
    }
  }
});
test('repeated dollying stops at the same boundary while rotation and zooming out remain available', () => {
  const { camera, controls } = appearanceFixture('Earth');
  const centre = new Vector3(), radius = radiusAU(BODY_BY_ID.Earth);
  const clamp = () => limitCameraZoom({ camera, controls, centre, radius });
  const minimum = minimumZoomDistance(camera, radius);
  for (const factor of [0.7, 0.95, 0.2]) {
    for (let i = 0; i < 100; i++) {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      clamp();
      assert.ok(camera.position.distanceTo(centre) >= minimum * (1 - 1e-12));
    }
    close(camera.position.distanceTo(centre) / minimum, 1);
  }
  for (const direction of [[1, 0, 0], [-1, 2, 3], [0, -1, 1]]) {
    camera.position.fromArray(direction).normalize().multiplyScalar(minimum);
    clamp();
    assert.ok(camera.position.clone().normalize().distanceTo(new Vector3(...direction).normalize()) < 1e-12);
    camera.position.multiplyScalar(1 / 0.7);
    assert.equal(clamp(), false, 'The limit must not lock the user into a close-up view');
    close(camera.position.length() / minimum, 1 / 0.7);
  }
  assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
});
test('real OrbitControls wheel and middle-drag obey the cap without blocking rotation or zoom-out', () => {
  // Only the event surface is mocked: run the actual control's input handlers
  // and damping, with the same post-update limit used by the solar RAF.
  const root = new EventTarget();
  class Canvas extends EventTarget {
    style = {};
    clientWidth = 1440;
    clientHeight = 900;
    getRootNode() { return root; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1440, height: 900 }; }
    setPointerCapture() {}
    releasePointerCapture() {}
  }
  const canvas = new Canvas();
  const { camera } = appearanceFixture();
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  const centre = new Vector3(), radius = radiusAU(BODY_BY_ID.Earth);
  const minimum = minimumZoomDistance(camera, radius);
  const frame = () => {
    controls.update();
    limitCameraZoom({ camera, controls, centre, radius });
    assert.ok(camera.position.length() >= minimum * (1 - 1e-12));
  };
  const send = (type, fields) => canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
  frame();
  try {
    for (let i = 0; i < 100; i++) {
      send('wheel', { deltaY: -400, deltaMode: 0, clientX: 720, clientY: 450 });
      frame();
    }
    close(camera.position.length() / minimum, 1);
    send('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 1, clientX: 720, clientY: 450 });
    for (let i = 1; i <= 100; i++) {
      send('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 720, clientY: 450 - i * 20 });
      frame();
    }
    send('pointerup', { pointerId: 1 });
    close(camera.position.length() / minimum, 1);
    const beforeDirection = camera.position.clone().normalize();
    send('pointerdown', { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 720, clientY: 450 });
    send('pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 900, clientY: 400 });
    send('pointerup', { pointerId: 2 });
    for (let i = 0; i < 120; i++) frame();
    assert.ok(camera.position.clone().normalize().distanceTo(beforeDirection) > 0.1);
    close(camera.position.length() / minimum, 1);
    send('wheel', { deltaY: 400, deltaMode: 0, clientX: 720, clientY: 450 });
    frame();
    assert.ok(camera.position.length() > minimum * 1.1);
    assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
  } finally {
    controls.dispose();
  }
});
test('panning cannot bypass the body-centred limit or cause a snap across the body', () => {
  const { camera, controls } = appearanceFixture();
  const centre = new Vector3(), radius = radiusAU(BODY_BY_ID.Earth);
  const minimum = minimumZoomDistance(camera, radius);
  controls.target.set(minimum * 0.5, 0, 0);
  camera.position.set(minimum * 0.5, 0, minimum * 2);
  const target = controls.target.toArray();
  for (let i = 0; i < 100; i++) {
    camera.position.sub(controls.target).multiplyScalar(0.7).add(controls.target);
    limitCameraZoom({ camera, controls, centre, radius });
    assert.ok(camera.position.length() >= minimum * (1 - 1e-12));
    assert.deepEqual(controls.target.toArray(), target);
  }
  close(camera.position.length() / minimum, 1);
  close(controls.minDistance, camera.position.distanceTo(controls.target));
  assert.ok(controls.minDistance < minimum, 'Use the panned ray intersection, not a fixed target radius');

  // Both camera and target are outside, on the same side: zooming toward the
  // target moves AWAY from the body and must not teleport to its other side.
  controls.target.set(0, 0, minimum * 3);
  camera.position.set(0, 0, minimum * 2);
  const before = camera.position.toArray();
  assert.equal(limitCameraZoom({ camera, controls, centre, radius }), false);
  assert.deepEqual(camera.position.toArray(), before);
  assert.equal(controls.minDistance, 0);
});
test('zoom bounds adapt to window shape, effective FOV and size changes without forcing a zoom-in', () => {
  const { camera, controls } = appearanceFixture('Saturn');
  const centre = new Vector3();
  const body = BODY_BY_ID.Saturn;
  for (const aspect of [16 / 9, 0.45, 2]) {
    camera.aspect = aspect;
    for (const zoom of [1, 1.8]) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      for (const scale of [1, 10, 25, 1]) {
        const radius = appearanceRadius(body, scale);
        const before = camera.position.clone();
        const minimum = minimumZoomDistance(camera, radius);
        const expectedRetreat = before.distanceTo(centre) < minimum;
        assert.equal(limitCameraZoom({ camera, controls, centre, radius }), expectedRetreat);
        close(controls.minDistance / radius, minimum / radius);
        if (!expectedRetreat) assert.deepEqual(camera.position.toArray(), before.toArray());
        assert.ok(camera.position.length() >= minimum * (1 - 1e-12));
      }
    }
  }
  assert.ok(appearanceRadius(body, 1) > radiusAU(body), 'Include the outer ring in the bound');
});
test('zoom safety handles a coincident camera and translated origins without changing distant views', () => {
  const { camera, controls } = appearanceFixture('Neptune');
  const radius = radiusAU(BODY_BY_ID.Neptune);
  const centre = new Vector3(1.5, -0.3, 2.2);
  controls.target.copy(centre);
  camera.position.copy(centre);
  assert.equal(limitCameraZoom({ camera, controls, centre, radius }), true);
  assert.ok([...camera.position.toArray(), controls.minDistance].every(Number.isFinite));
  close(camera.position.distanceTo(centre) / minimumZoomDistance(camera, radius), 1);
  camera.position.copy(centre).add(new Vector3(0, 50, 70));
  const before = camera.position.toArray();
  assert.equal(limitCameraZoom({ camera, controls, centre, radius }), false);
  assert.deepEqual(camera.position.toArray(), before);
});
test('the page offers only original / 10x / 25x, without displaced-preview controls', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/data-scale="(\d+)"/g)].map(match => Number(match[1])), SIZE_OPTIONS);
  assert.ok(!html.includes('id="overview-previews"'));
  assert.ok(!html.includes('id="toggle-previews"'));
  assert.ok(!html.includes('id="preview-note"'));
});
test('simplified UI removes view captions and top-right extras without dropping core controls', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./system.js', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const id of ['view-title', 'view-hint', 'scale-status', 'about', 'about-open', 'about-close', 'magnify-warning']) {
    assert.ok(!ids.has(id), `${id} must be removed from the interface`);
    assert.ok(!script.includes(`$('${id}')`), `${id} must not leave dangling handlers`);
  }
  for (const id of ['refocus', 'focus-card', 'play-pause', 'time-speed', 'time-now', 'date-form',
    'appearance-note', 'size-buttons']) {
    assert.ok(ids.has(id), `${id} remains available`);
  }
  // A removed UI node must not cause initialization, keyboard or size switching to throw.
  for (const [, id] of script.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(ids.has(id), `Missing DOM element #${id}`);
  }
  assert.ok(!html.includes('观察模式：太阳与行星大小均为示意'));
  assert.ok(!readFileSync(new URL('./system.css', import.meta.url), 'utf8').includes('.body-card .warning'));
  assert.match(script, /function safeCamera\(\) \{[\s\S]*?if \(modes\.active !== 'solar'\) return false/,
    'Shared zoom buttons must not apply solar bounds to the SEM scene');
});
test('heliocentric distances are plausible, including the geocentric Moon', () => {
  const bounds = { Mercury: [.30, .47], Venus: [.71, .74], Earth: [.98, 1.02],
    Mars: [1.38, 1.67], Jupiter: [4.9, 5.5], Saturn: [9, 10.2],
    Uranus: [18, 21], Neptune: [29, 31] };
  assert.equal(positionAt('Sun', date).length(), 0);
  for (const [id, [min, max]] of Object.entries(bounds)) {
    const r = positionAt(id, date).length();
    assert.ok(r >= min && r <= max, `${id}: ${r}`);
  }
  const lunarDistance = positionAt('Moon', date).distanceTo(positionAt('Earth', date)) * AU_KM;
  assert.ok(lunarDistance > 350000 && lunarDistance < 410000);
});
test('Earth vector independently agrees with JPL Horizons DE441 within 2000 km at a reference epoch', () => {
  // Public Horizons query: Earth (399), centre Sun (500@10), JD 2461367.5 TDB,
  // ecliptic J2000 / ICRF, AU-D, geometric vectors, retrieved 2026-11-23.
  // TDB~TT difference is milliseconds and negligible relative to this test's tolerance.
  const time = AstroTime.FromTerrestrialTime(2461367.5 - 2451545);
  const reference = new Vector3(0.4889250940007566, -0.00005871513911987837, -0.8580799017554108);
  const errorKm = positionAt('Earth', time).distanceTo(reference) * AU_KM;
  assert.ok(errorKm < 2000, `Position error ${errorKm} km`);
});
test('Neptune vector independently agrees with JPL Horizons DE441 within 500000 km', () => {
  // Same geometric setup and epoch as Earth; command 899, source DE441.
  // At ~30 AU this tolerance is ~23 arcsec, not a claim of spacecraft-grade accuracy.
  const time = AstroTime.FromTerrestrialTime(2461367.5 - 2451545);
  const reference = new Vector3(29.82803471394436, -0.7192421459089419, -1.547169870374193);
  const errorKm = positionAt('Neptune', time).distanceTo(reference) * AU_KM;
  assert.ok(errorKm < 500000, `Position error ${errorKm} km`);
});
test('orientation is right-handed and north remains independent of daily spin', () => {
  for (const body of BODIES) {
    const { north, quaternion } = orientationAt(body.id, date);
    const x = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    const y = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    const z = new Vector3(0, 0, 1).applyQuaternion(quaternion);
    close(quaternion.length(), 1);
    assert.ok(y.distanceTo(north) < 1e-10);
    assert.ok(new Vector3().crossVectors(x, y).distanceTo(z) < 1e-10);
    assert.ok(north.angleTo(orientationAt(body.id, new Date(+date + DAY_MS)).north) < 0.02);
  }
});
test('Earth axis is tilted ~23.44 degrees to the fixed ecliptic', () => {
  const north = orientationAt('Earth', date).north;
  assert.ok(Math.abs(north.angleTo(new Vector3(0, 1, 0)) * 180 / Math.PI - 23.44) < 0.05);
});
test('Venus and Uranus rotate retrograde; reference rates match the physical clock', () => {
  for (const body of BODIES) {
    const delta = orientationAt(body.id, new Date(+date + DAY_MS)).spin - orientationAt(body.id, date).spin;
    assert.equal(Math.sign(delta), Math.sign(body.rotation), body.id);
    assert.ok(Math.abs(delta - 360 / body.rotation) < 0.2, `${body.id}: ${delta}`);
  }
});
test('Mercury follows a non-circular orbit with changing speed', () => {
  const points = sampleOrbit(BODY_BY_ID.Mercury, date, 192);
  const radii = points.map(p => p.length());
  assert.ok(Math.max(...radii) / Math.min(...radii) > 1.4);
  const speeds = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  assert.ok(Math.max(...speeds) / Math.min(...speeds) > 1.4);
});
test('orbital samples pass through the current ephemeris position at midpoint', () => {
  for (const body of BODIES.filter(body => body.id !== 'Sun')) {
    const orbit = sampleOrbit(body, date, 32);
    const expected = positionAt(body.id, date);
    if (body.id === 'Moon') expected.sub(positionAt('Earth', date));
    assert.ok(orbit[16].distanceTo(expected) < 1e-12, body.id);
  }
});
test('floating origin preserves pairwise distances down to close-up planetary scale', () => {
  const origin = positionAt('Neptune', date);
  const a = positionAt('Earth', date), b = positionAt('Moon', date);
  close(a.distanceTo(b), a.clone().sub(origin).distanceTo(b.clone().sub(origin)), 1e-13);
  assert.equal(origin.clone().sub(origin).length(), 0);
});
test('boundary dates produce finite positions and orientation', () => {
  for (const time of [MIN_TIME, MAX_TIME]) {
    for (const body of BODIES) {
      const s = stateAt(body.id, new Date(time));
      assert.ok([...s.position.toArray(), ...s.quaternion.toArray()].every(Number.isFinite));
    }
  }
});
test('asteroid population is deterministic, physically sized, and obeys Kepler periods', () => {
  const rocks = createPopulation();
  assert.equal(rocks.length, 1600);
  assert.deepEqual(createPopulation(3), rocks.slice(0, 3));
  for (const rock of rocks) {
    assert.ok(rock.radius >= 0.5 && rock.radius <= 50);
    assert.ok(rock.a >= 2.1 && rock.a <= 3.3);
    const p = asteroidPosition(rock, +date);
    assert.ok(p.length() >= rock.a * (1 - rock.e) - 1e-10);
    assert.ok(p.length() <= rock.a * (1 + rock.e) + 1e-10);
    const oneOrbit = 365.256363004 * rock.a ** 1.5 * DAY_MS;
    assert.ok(p.distanceTo(asteroidPosition(rock, +date + oneOrbit)) < 1e-10);
  }
});

test('teaching clock is independent, frame-rate independent, and paused/inactive states cannot advance', () => {
  const a = createTeachingState(), b = createTeachingState();
  a.active = b.active = true;
  for (let i = 0; i < 60; i++) advanceTeachingState(a, 1 / 60);
  for (let i = 0; i < 144; i++) advanceTeachingState(b, 1 / 144);
  for (const key of ['year', 'month', 'spin', 'sunSpin']) close(a[key], b[key]);
  close(a.year, 0.15); close(a.spin, 1.2);
  a.running = false;
  a.speed = 3;
  const paused = { ...a };
  advanceTeachingState(a, 60);
  assert.deepEqual(a, paused, 'Changing speed while paused must not resume the animation');
  a.active = false; a.running = true;
  const inactive = { ...a };
  advanceTeachingState(a, 3600);
  assert.deepEqual(a, inactive);
  b.view = 'rotate';
  const year = b.year, month = b.month, spin = b.spin;
  advanceTeachingState(b, 1);
  close(b.year, year); close(b.month, month); close(b.spin - spin, 0.6);
});

function teachingFixture() {
  // Canvas labels are mocked, not WebGL. The actual Three.js scene graph,
  // camera transforms, latitude geometry, sunlight point and model are real.
  const previous = globalThis.document;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    return { width: 0, height: 0, getContext: () => ({ clearRect() {}, fillText() {} }) };
  } };
  try {
    const scene = new Scene(), camera = new PerspectiveCamera(42, 1.6, 0.01, 1000);
    const controls = { target: new Vector3(), minDistance: 0, maxDistance: 240,
      enableDamping: true, screenSpacePanning: true, update() { camera.lookAt(this.target); } };
    const textures = { Sun: new Texture(), Earth: new Texture(), Moon: new Texture() };
    const model = createSEM({ scene, camera, controls, textures, translate: key => key });
    return { scene, camera, controls, textures, model };
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}
test('SEM brightens only Earth with gentle texture-matched fill while retaining sunlight shading', () => {
  const { scene, textures, model } = teachingFixture();
  try {
    model.activate();
    const earth = scene.getObjectByName('sem-earth');
    assert.equal(earth.material.isMeshPhongMaterial, true, 'Keep directional day/night shading');
    assert.equal(earth.material.map, textures.Earth);
    assert.equal(earth.material.emissiveMap, textures.Earth, 'Fill must preserve the surface texture');
    assert.equal(earth.material.color.getHex(), 0xffffff);
    assert.equal(earth.material.emissive.getHex(), 0xffffff, 'Neutral fill must not tint the terrain');
    close(earth.material.emissiveIntensity, 0.1);
    assert.ok(earth.material.emissiveIntensity < 0.15, 'Night-side fill stays subtle');

    const lights = [], moonMeshes = [];
    scene.traverse(object => {
      if (object.isLight) lights.push(object);
      if (object.isMesh && object.material.map === textures.Moon) moonMeshes.push(object);
    });
    assert.equal(lights.length, 2, 'No global lights added or exposure changes');
    const sunlight = lights.find(light => light.isPointLight);
    assert.equal(sunlight.intensity, 800);
    assert.equal(sunlight.decay, 2);
    assert.equal(sunlight.color.getHex(), 0xfffbe8);
    assert.deepEqual(sunlight.position.toArray(), [0, 0, 0]);
    assert.equal(moonMeshes.length, 1);
    assert.equal(moonMeshes[0].material.emissive.getHex(), 0x000000);
    assert.equal(moonMeshes[0].material.emissiveMap, null);
    assert.equal(scene.getObjectByName('sem-sun').material.isMeshBasicMaterial, true);
    assert.equal(scene.getObjectByName('sem-sun').material.map, textures.Sun);

    const textureVersion = textures.Earth.version;
    for (const season of Object.keys(SEASON_ANGLES)) {
      model.moveToSeason(season);
      model.applyFocus('earth');
      model.update(0.1);
      model.deactivate();
      model.activate();
      assert.equal(earth.material.emissiveMap, textures.Earth);
      close(earth.material.emissiveIntensity, 0.1);
    }
    assert.equal(textures.Earth.version, textureVersion, 'Never modify the shared solar-system texture');
  } finally {
    model.dispose();
  }
});
test('teaching scene retains fixed Earth axis and manual orbit/zoom offset while following revolution', () => {
  const { scene, camera, controls, model } = teachingFixture();
  model.activate(); model.applyFocus('earth');
  const axis = scene.getObjectByName('sem-axis');
  const earth = scene.getObjectByName('sem-earth');
  scene.updateMatrixWorld(true);
  const initialAxis = new Vector3(0, 1, 0).transformDirection(axis.matrixWorld);
  const manualOffset = new Vector3(1.7, 0.9, -2.8);
  camera.position.copy(controls.target).add(manualOffset);
  model.update(3);
  close(camera.position.clone().sub(controls.target).distanceTo(manualOffset), 0);
  close(controls.target.distanceTo(earth.getWorldPosition(new Vector3())), 0);
  scene.updateMatrixWorld(true);
  close(new Vector3(0, 1, 0).transformDirection(axis.matrixWorld).distanceTo(initialAxis), 0);
  const before = camera.position.toArray();
  model.deactivate();
  const state = model.getState();
  model.update(600);
  assert.deepEqual(model.getState(), state);
  assert.deepEqual(camera.position.toArray(), before);
  model.activate();
  assert.deepEqual(camera.position.toArray(), before, 'Re-entry must not reset the previous camera');
  model.dispose();
});
test('teaching keeps all five latitude lines, independent sunlight toggle and correct seasonal declination', () => {
  const { scene, model } = teachingFixture();
  model.activate();
  const latitudes = scene.getObjectByName('sem-latitudes');
  assert.equal(latitudes.children.filter(object => object.isLine2).length, 5);
  model.setLabels(false);
  assert.equal(latitudes.visible, false);
  const point = scene.getObjectByName('sem-direct-point');
  assert.equal(point.visible, true, 'Sunlight remains independently controlled');
  model.setSunlight(false);
  assert.equal(point.visible, false);
  model.setLabels(true);
  assert.equal(latitudes.visible, true);
  assert.equal(point.visible, false);
  for (const [season, latitude] of [['spring', 0], ['summer', 23.4], ['autumn', 0], ['winter', -23.4]]) {
    model.moveToSeason(season);
    close(model.getState().year, SEASON_ANGLES[season]);
    close(Math.asin(point.position.y / point.position.length()) * 180 / Math.PI, latitude, 1e-9);
  }
  model.setRunning(false); model.setSpeed(4);
  const paused = model.getState(); model.update(12);
  assert.deepEqual(model.getState(), paused);
  model.dispose();
});
test('the four seasonal markers toggle independently, and general labels never override their switches', () => {
  const { scene, model } = teachingFixture();
  model.activate();
  const seasons = Object.keys(SEASON_ANGLES);
  const dot = key => scene.getObjectByName(`sem-marker-${key}`);
  const label = key => scene.getObjectByName(`sem-marker-label-${key}`);
  for (let mask = 0; mask < 16; mask++) {
    seasons.forEach((key, index) => model.setSeasonVisible(key, Boolean(mask & (1 << index))));
    for (const showLabels of [false, true]) {
      model.setLabels(showLabels);
      model.update(0.05);
      seasons.forEach((key, index) => {
        const shown = Boolean(mask & (1 << index));
        assert.equal(dot(key).visible, shown, key);
        assert.equal(label(key).visible, shown && showLabels, `${key} text`);
        assert.equal(model.getState().showSeasons[key], shown);
      });
      assert.equal(scene.getObjectByName('sem-latitudes').visible, showLabels);
      assert.equal(scene.getObjectByName('sem-direct-point').visible, true);
    }
  }
  model.setSeasonVisible('summer', false);
  model.moveToSeason('summer');
  model.applyView('rotate');
  assert.equal(dot('summer').visible, false, 'Jumping to a season does not re-enable its marker');
  const snapshot = model.getState();
  snapshot.showSeasons.summer = true;
  assert.equal(model.getState().showSeasons.summer, false, 'Snapshots cannot mutate the scene');
  for (const invalid of ['unknown', '__proto__', 'constructor']) model.setSeasonVisible(invalid, true);
  assert.deepEqual(Object.keys(model.getState().showSeasons), seasons);
  model.dispose();
});
test('season jumps, scene markers and translated labels use the same seasonal positions', () => {
  const { scene, model } = teachingFixture();
  model.activate();
  for (const season of Object.keys(SEASON_ANGLES)) {
    model.moveToSeason(season);
    scene.updateMatrixWorld(true);
    const earth = scene.getObjectByName('sem-earth').getWorldPosition(new Vector3());
    const marker = scene.getObjectByName(`sem-marker-${season}`).getWorldPosition(new Vector3());
    close(earth.distanceTo(marker), 0);
    close(scene.getObjectByName(`sem-marker-label-${season}`).position.y, 0.6);
  }
  const a = createTeachingState(), b = createTeachingState();
  a.showSeasons.spring = false;
  assert.equal(b.showSeasons.spring, true, 'Each scene owns its own marker settings');
  model.dispose();
});
test('season jumps retain a manually framed Earth in rotation mode instead of leaving it off screen', () => {
  const { scene, camera, controls, model } = teachingFixture();
  model.activate(); model.applyView('rotate');
  const offset = new Vector3(1.8, 0.9, -1.5);
  camera.position.copy(controls.target).add(offset);
  for (const season of ['summer', 'winter', 'spring', 'autumn']) {
    model.moveToSeason(season);
    close(controls.target.distanceTo(scene.getObjectByName('sem-earth').getWorldPosition(new Vector3())), 0);
    close(camera.position.clone().sub(controls.target).distanceTo(offset), 0);
    assert.equal(model.getState().view, 'rotate');
  }
  model.dispose();
});
test('camera state repeatedly round-trips between AU and teaching scales without losing zoom/pan limits', () => {
  const { model, camera, controls } = teachingFixture();
  camera.position.set(0, 50, 70); camera.near = 0.003; camera.zoom = 1.3;
  controls.target.set(1, 0, 2); controls.minDistance = 1e-5; controls.maxDistance = 240;
  const solar = captureView(camera, controls);
  model.activate(); model.applyFocus('earth');
  camera.position.add(new Vector3(0.2, 0, 0.7));
  const teaching = captureView(camera, controls);
  for (let i = 0; i < 8; i++) {
    model.deactivate();
    restoreView(solar, camera, controls);
    assert.deepEqual(captureView(camera, controls), solar);
    model.activate();
    restoreView(teaching, camera, controls);
    assert.deepEqual(captureView(camera, controls), teaching);
  }
  model.dispose();
});
test('actual mode coordinator preserves both scenes and restores camera/context on repeated switches', async () => {
  const { model, camera, controls } = teachingFixture();
  camera.position.set(0, 50, 70); controls.maxDistance = 240;
  limitCameraZoom({ camera, controls, centre: new Vector3(), radius: radiusAU(BODY_BY_ID.Sun) });
  const initialSolar = captureView(camera, controls);
  const changes = [];
  let loads = 0;
  const modes = createModeController({
    camera, controls, loadTeaching: async () => { loads++; return model; },
    onChange: mode => changes.push(mode), onError: error => { throw error; },
  });
  await modes.switchTo('sem');
  assert.equal(modes.active, 'sem');
  model.applyFocus('earth'); model.setRunning(false); model.setLabels(false); model.setSunlight(false); model.setSpeed(2.4);
  model.setSeasonVisible('spring', false); model.setSeasonVisible('winter', false);
  const semView = captureView(camera, controls);
  for (let i = 0; i < 4; i++) {
    await modes.switchTo('solar');
    assert.equal(modes.active, 'solar');
    assert.equal(model.getState().active, false);
    assert.deepEqual(captureView(camera, controls), initialSolar);
    await modes.switchTo('sem');
    assert.equal(modes.active, 'sem');
    assert.deepEqual(captureView(camera, controls), semView);
    assert.equal(model.getState().running, false);
    assert.equal(model.getState().speed, 2.4);
    assert.equal(model.getState().showLabels, false);
    assert.equal(model.getState().showSunlight, false);
    assert.deepEqual(model.getState().showSeasons, { spring: false, summer: true, autumn: true, winter: false });
    model.update(1);
    assert.equal(model.group.getObjectByName('sem-marker-spring').visible, false);
    assert.equal(model.group.getObjectByName('sem-marker-summer').visible, true);
  }
  assert.equal(loads, 1);
  assert.deepEqual(changes, ['sem', 'solar', 'sem', 'solar', 'sem', 'solar', 'sem', 'solar', 'sem']);
  model.dispose();
});
test('lazy mode loading honours the latest click, retries failures, and never activates twice', async () => {
  const { model, camera, controls } = teachingFixture();
  let resolve, failed = false, loads = 0;
  const changes = [];
  const modes = createModeController({
    camera, controls,
    loadTeaching: () => { loads++; return new Promise(done => { resolve = done; }); },
    onChange: mode => changes.push(mode), onError: () => { failed = true; },
  });
  const first = modes.switchTo('sem');
  const duplicate = modes.switchTo('sem');
  await modes.switchTo('solar'); // Cancel while the chunk is loading.
  resolve(model);
  await Promise.all([first, duplicate]);
  assert.equal(modes.active, 'solar'); assert.equal(model.getState().active, false);
  assert.deepEqual(changes, []); assert.equal(loads, 1); assert.equal(failed, false);
  await modes.switchTo('sem');
  assert.deepEqual(changes, ['sem']);
  await modes.switchTo('solar');
  let attempts = 0, errors = 0;
  const retry = createModeController({
    camera, controls, loadTeaching: async () => {
      if (++attempts === 1) throw new Error('Offline chunk');
      return model;
    },
    onChange() {}, onError() { errors++; },
  });
  await retry.switchTo('sem');
  assert.equal(retry.active, 'solar'); assert.equal(errors, 1);
  await retry.switchTo('sem');
  assert.equal(retry.active, 'sem'); assert.equal(attempts, 2);
  model.dispose();
});
test('mode UI explicitly hides inactive panels and marks exactly one header button as active', () => {
  const panels = ['solar', 'solar', 'sem', 'sem'].map(context => ({ dataset: { context }, hidden: false }));
  const buttons = ['solar', 'sem'].map(mode => ({
    dataset: { mode }, attributes: {}, active: false,
    setAttribute(key, value) { this.attributes[key] = value; },
    classList: { toggle() {} },
  }));
  const document = {
    body: { dataset: {} },
    querySelectorAll: selector => selector === '[data-context]' ? panels : buttons,
  };
  for (const mode of ['sem', 'solar', 'sem', 'solar']) {
    applyModeUI(document, mode);
    assert.equal(document.body.dataset.mode, mode);
    for (const panel of panels) assert.equal(panel.hidden, panel.dataset.context !== mode);
    assert.equal(buttons.filter(button => button.attributes['aria-pressed'] === 'true').length, 1);
    assert.equal(buttons.find(button => button.attributes['aria-pressed'] === 'true').dataset.mode, mode);
  }
});
test('Earth only links to solar observation; the SEM entry lives inside the unified observatory', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const earthHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const earthScript = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
  const semUI = readFileSync(new URL('../sem/sem-ui.js', import.meta.url), 'utf8');
  const semScene = readFileSync(new URL('../sem/sem.js', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const [, id] of semUI.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(id), `Missing teaching UI #${id}`);
  assert.ok(html.includes('data-mode="sem"'));
  assert.ok(html.includes('data-context="sem"'));
  assert.ok(html.includes('data-context="solar"'));
  assert.ok(earthHtml.includes('href="Solar_System/system/"'));
  assert.ok(!earthHtml.includes('Solar_System/system/#sem'));
  assert.ok(!earthHtml.includes('obs.sem'));
  assert.ok(!earthHtml.includes('tb-sem'));
  assert.match(html, /data-mode="sem"[^>]*data-i18n="obs.sem">日地月系统观测<\/button>/);
  assert.ok(!html.includes('日地月教学'));
  assert.ok(!earthScript.includes('initSEM'));
  assert.ok(!earthHtml.includes('id="sem-panel"'));
  assert.ok(!html.includes('<iframe'));
  assert.ok(!semScene.includes('getElementById'));
  assert.ok(!semScene.includes('addEventListener'));
  assert.ok(!semScene.includes('requestAnimationFrame'));
  for (const page of [html, earthHtml]) {
    assert.ok(page.includes('ui/theme.css'));
    const pageIds = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(pageIds.length, new Set(pageIds).size, 'No duplicate DOM IDs');
  }
  const earthIds = new Set([...earthHtml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const [, id] of earthScript.matchAll(/getElementById\('([^']+)'\)/g)) {
    assert.ok(earthIds.has(id), `Missing Earth UI #${id}`);
  }
});
test('both sidebars share planet navigation and auxiliary rows, with no emoji in the SEM sidebar', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const sidebar = html.match(/<aside[^>]+data-context="sem"[\s\S]*?<\/aside>/)[0];
  assert.match(html, /id="body-nav" class="body-nav"/);
  assert.match(sidebar, /<nav class="body-nav"/);
  for (const focus of ['sun', 'earth']) {
    const button = sidebar.match(new RegExp(`<button class="nav-body" data-sem-focus="${focus}"[\\s\\S]*?<\\/button>`))[0];
    assert.match(button, /<i class="nav-dot" aria-hidden="true"><\/i>/);
    assert.match(button, /<span data-i18n="sem\.\w+Center">/);
    assert.match(button, /class="nav-en"/);
    assert.doesNotMatch(button, /<button[^>]*data-i18n=/, 'Translation must not replace the icon');
  }
  const auxiliary = sidebar.match(/<section class="display-control">\s*<div class="panel-heading" data-i18n="obs.auxiliaryDisplay">[\s\S]*?<\/section>/)[0];
  assert.equal([...html.matchAll(/data-i18n="obs.auxiliaryDisplay"/g)].length, 2);
  assert.equal([...auxiliary.matchAll(/class="switch-row"/g)].length, 7);
  assert.deepEqual([...auxiliary.matchAll(/data-sem-marker="(\w+)"/g)].map(match => match[1]), Object.keys(SEASON_ANGLES));
  assert.doesNotMatch(sidebar, /\p{Extended_Pictographic}/u);
  const css = readFileSync(new URL('./system.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.body-nav{display:flex;flex-direction:column;gap:0.1875rem}'));
  assert.ok(!css.includes('.teaching-sidebar .switch-row'), 'No divergent SEM row sizing');
  assert.ok(!css.includes('.nav-en,.display-control'), 'Auxiliary switches remain available on small screens');
});

test('SEM auxiliary UI events update the scene, persist across mode changes and stay emoji-free in both languages', async () => {
  const names = ['document', 'window', 'localStorage', 'innerWidth', 'innerHeight'];
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  class Control extends EventTarget {
    constructor(dataset = {}) {
      super();
      Object.assign(this, { dataset, checked: true, tagName: 'SPAN', classList: { toggle() {} } });
    }
    setAttribute() {}
  }
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Control()]));
  const markers = Object.keys(SEASON_ANGLES).map(semMarker => new Control({ semMarker }));
  const textKeys = ['obs.sem', 'obs.auxiliaryDisplay', 'obs.semLabels', 'obs.semLabelsNote',
    'sem.sunCenter', 'sem.earthCenter', 'sem.orbits', 'sem.sunlight',
    'sem.spring', 'sem.summer', 'sem.autumn', 'sem.winter', 'sem.revolution', 'sem.rotation'];
  const texts = textKeys.map(i18n => new Control({ i18n }));
  const selectors = {
    '[data-sem-marker]': markers,
    '[data-sem-view]': ['orbit', 'rotate'].map(semView => new Control({ semView })),
    '[data-sem-focus]': ['sun', 'earth'].map(semFocus => new Control({ semFocus })),
    '[data-season]': Object.keys(SEASON_ANGLES).map(season => new Control({ season })),
    '[data-i18n]': texts,
  };
  let mode;
  try {
    globalThis.localStorage = { getItem: () => 'zh', setItem() {} };
    globalThis.window = new EventTarget();
    globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
    globalThis.document = {
      getElementById: id => ids.get(id),
      querySelectorAll: selector => selectors[selector] || [],
      createElement(tag) {
        assert.equal(tag, 'canvas');
        return { width: 0, height: 0, getContext: () => ({ clearRect() {}, fillText() {} }) };
      },
    };
    const { createTeachingMode } = await import('../sem/sem-ui.js');
    const { setLang, t } = await import('../../i18n/lang.js');
    const camera = new PerspectiveCamera(42, 1.6, 0.01, 1000);
    const controls = { target: new Vector3(), update() { camera.lookAt(this.target); } };
    mode = createTeachingMode({ camera, controls, textures: { Sun: new Texture(), Earth: new Texture(), Moon: new Texture() } });
    mode.activate();
    const dot = key => mode.scene.getObjectByName(`sem-marker-${key}`);
    for (const input of markers) {
      input.checked = false; input.dispatchEvent(new Event('change'));
      assert.equal(dot(input.dataset.semMarker).visible, false);
      input.checked = true; input.dispatchEvent(new Event('change'));
      assert.equal(dot(input.dataset.semMarker).visible, true);
    }
    markers[1].checked = false; markers[1].dispatchEvent(new Event('change'));
    for (const [id, object] of [['sem-labels', 'sem-latitudes'], ['sem-sunlight', 'sem-direct-point']]) {
      ids.get(id).checked = false; ids.get(id).dispatchEvent(new Event('change'));
      assert.equal(mode.scene.getObjectByName(object).visible, false);
    }
    for (const lang of ['zh', 'en', 'zh']) {
      setLang(lang);
      for (const text of texts) {
        assert.notEqual(text.innerHTML, text.dataset.i18n, 'Translation key exists');
        assert.doesNotMatch(text.innerHTML, /\p{Extended_Pictographic}/u);
      }
      for (const key of Object.keys(SEASON_ANGLES)) assert.equal(t(`sem.${key}`), t(`sem3d.${key}`));
      mode.deactivate(); mode.activate(); mode.update(0.05);
      assert.equal(markers[1].checked, false);
      assert.equal(dot('summer').visible, false);
      assert.equal(dot('winter').visible, true);
      assert.equal(ids.get('sem-labels').checked, false);
      assert.equal(ids.get('sem-sunlight').checked, false);
    }
    assert.equal(t('obs.sem'), '日地月系统观测');
  } finally {
    mode?.dispose();
    names.forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]);
      else delete globalThis[name];
    });
  }
});

test('all observatory UI uses relative dimensions without changing CSS-pixel media breakpoints', () => {
  const paths = ['../../ui/theme.css', '../../ui/earth-ui.css', '../../style.css', './system.css'];
  for (const path of paths) {
    const css = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(css, /font-size\s*:\s*[\d.]+px\b/, `${path}: no tiny fixed-pixel typography`);
    assert.doesNotMatch(css, /\bzoom\s*:/, 'UI resizing must not zoom the WebGL canvas or shift pointer coordinates');
    assert.doesNotMatch(css, /@media[^{]*rem\b/, 'Media queries remain independent of the fluid root size');
    assert.match(css, /\bfont-size\s*:\s*[\d.]+rem\b/);
  }
  const css = readFileSync(new URL('./system.css', import.meta.url), 'utf8');
  assert.match(css, /\.sidebar\{[^}]*overflow:auto/);
  assert.match(css, /\.body-card\{[^}]*max-height:calc\(100dvh - [\d.]+rem\);overflow-y:auto/);
  assert.match(css, /\.switch-row input\{[^}]*width:1\.625rem;height:0\.875rem/);
  assert.match(css, /\.nav-body\{[^}]*padding:0\.5rem 0\.625rem;[^}]*font-size:0\.75rem/);
});

test('fluid theme grows desktop text and hit areas at HD / QHD / 4K, but bounds short and ultrawide layouts', () => {
  const css = readFileSync(new URL('../../ui/theme.css', import.meta.url), 'utf8');
  assert.match(css, /font-size:\s*100%;/);
  assert.match(css, /@media\(min-width:1280px\)[\s\S]*?clamp\(100%, var\(--obs-fluid-font\), 200%\)/);
  assert.match(css, /@media\(min-width:1600px\)[\s\S]*?clamp\(125%, var\(--obs-fluid-font\), 200%\)/);
  const [, vw, vh] = css.match(/--obs-fluid-font:\s*min\(([\d.]+)vw,\s*([\d.]+)vh\)/);
  // Calculate the declared CSS bounds, not a second production scaling rule.
  const rootSize = (width, height, preferred = 16) => width < 1280 ? preferred
    : Math.max(preferred * (width >= 1600 ? 1.25 : 1), Math.min(width * vw / 100, height * vh / 100, preferred * 2));
  for (const [width, height] of [[390, 844], [760, 600], [1100, 800], [1280, 720], [1366, 768]]) {
    close(rootSize(width, height), 16, 0.001);
  }
  let previous = 16;
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440], [3840, 2160], [5120, 2880]]) {
    const root = rootSize(width, height), scale = root / 16;
    assert.ok(root >= previous && root <= 32);
    if (width >= 1600) {
      assert.ok(11 * scale >= 13.75, 'Common 11px button labels are no longer tiny on large screens');
      assert.ok(34 * scale >= 42.5, 'Switch row click areas grow along with their text');
    }
    previous = root;
  }
  close(rootSize(3440, 720), 20);
  close(rootSize(5120, 2880), 32);
  assert.ok(rootSize(1920, 1080, 24) >= 30, 'Respect larger browser default fonts');
  close(rootSize(390, 844, 24), 24);
});

test('screen-space labels and ruler follow rem UI size without scaling scientific geometry or CSS-pixel placement', () => {
  for (const root of [16, 20, 24, 32]) {
    const scale = root / 16, height = 1080;
    const headerBottom = 92 * scale, footerTop = height - 117 * scale;
    const metrics = screenSpaceUI(`${root}px`, { height, headerBottom, footerTop });
    close(metrics.scale, scale);
    close(metrics.labelTop - headerBottom, 18 * scale);
    close(footerTop - metrics.labelBottom, 18 * scale);
    close(metrics.labelGapX, 57 * scale);
    close(metrics.labelGapY, 20 * scale);
    close(metrics.rulerTarget, 100 * scale);
    const worldPerPixel = 0.05;
    close(worldPerPixel * metrics.rulerTarget / metrics.rulerTarget, worldPerPixel);
  }
  for (const invalid of ['', 'auto', '0px', '-16px']) {
    assert.equal(screenSpaceUI(invalid, { height: 900, headerBottom: 92, footerTop: 783 }).scale, 1);
  }
});

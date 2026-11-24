import '../../guard.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AU_KM, BODIES, BODY_BY_ID, DAY_MS, MIN_TIME, MAX_TIME, SIZE_OPTIONS, radiusAU } from './data.js';
import { stateAt, sampleOrbit } from './astronomy.js';
import { createAsteroidBelt, seededRandom } from './asteroids.js';
import { appearanceRadius, applyAppearanceScale, updateAppearanceForView } from './appearance.js';
import { applyModeUI, createModeController } from './mode-controller.js';
import { getLang, setLang, updateDOM } from '../../i18n/lang.js';

const $ = id => document.getElementById(id);
const textureURLs = {
  Sun: new URL('../textures/sun.jpg', import.meta.url).href,
  Mercury: new URL('../textures/Mercury.jpg', import.meta.url).href,
  Venus: new URL('../textures/Venus_Atmosphere.jpg', import.meta.url).href,
  Earth: new URL('../../earth/main/earth.jpg', import.meta.url).href,
  Mars: new URL('../textures/Mars.jpg', import.meta.url).href,
  Jupiter: new URL('../textures/Jupiter.jpg', import.meta.url).href,
  Saturn: new URL('../textures/Saturn.jpg', import.meta.url).href,
  Uranus: new URL('../textures/Uranus.jpg', import.meta.url).href,
  Neptune: new URL('../textures/Neptune.jpg', import.meta.url).href,
  Moon: new URL('../textures/moon.jpg', import.meta.url).href,
  ring: new URL('../textures/Saturn_Ring.png', import.meta.url).href,
  venusSurface: new URL('../textures/Venus_Surface.jpg', import.meta.url).href,
};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
} catch (error) {
  $('loading-text').textContent = '无法启动 WebGL。请在支持硬件加速的浏览器中打开本页面。';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
$('scene').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a10);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1e-8, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.85;
controls.maxDistance = 240;
controls.screenSpacePanning = true;
scene.add(new THREE.AmbientLight(0xffffff, 0.18)); // For tiny physical asteroid rocks only.
const asteroidLight = new THREE.DirectionalLight(0xffffff, 2);
asteroidLight.position.set(0, 10, 0);
scene.add(asteroidLight);

const origin = new THREE.Vector3(); // Floating origin follows selected body's centre, not its rotation.
const nodes = new Map();
let selected = 'Sun', follow = false, sizeScale = 1, running = true, speed = 1;
let simulationTime = Math.min(MAX_TIME, Math.max(MIN_TIME, Date.now()));
let currentView = 'all', venusSurface = false, venusSurfaceTexture = null;
let labelsVisible = true, axesVisible = false;
let lastFrame = performance.now(), lastUI = 0, lastOrbitEpoch = simulationTime;
let orbitRebuildPending = false, noticeTimeout;
let loadedTextures;
const modes = createModeController({
  camera, controls,
  loadTeaching: () => import('../sem/sem-ui.js').then(({ createTeachingMode }) => createTeachingMode({
    camera, controls, textures: loadedTextures, backgroundStars: stars.clone(),
  })),
  onChange(mode) {
    clearTimeout(noticeTimeout);
    $('notice').classList.remove('visible');
    applyModeUI(document, mode);
    history.replaceState(null, '', `${location.pathname}${location.search}${mode === 'sem' ? '#sem' : ''}`);
    lastFrame = performance.now();
  },
  onError(error) {
    console.error('Teaching mode could not load', error);
    notify('日地月系统观测暂时载入失败，可重试；太阳系观测仍可使用。');
  },
});
const textureLoader = new THREE.TextureLoader();
const orbitRoot = new THREE.Group();
scene.add(orbitRoot);

function notify(message, duration = 5200) {
  $('notice').textContent = message;
  $('notice').classList.add('visible');
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => $('notice').classList.remove('visible'), duration);
}
async function loadTexture(url, id) {
  const texture = await textureLoader.loadAsync(url);
  // Keep the user's original files intact; limit GPU copies to avoid >1 GB of mipmapped maps.
  const maxSide = Math.min(renderer.capabilities.maxTextureSize, innerWidth < 761 ? 2048 : 4096);
  const image = texture.image;
  if (Math.max(image.width, image.height) > maxSide) {
    const canvas = document.createElement('canvas');
    const factor = maxSide / Math.max(image.width, image.height);
    canvas.width = Math.round(image.width * factor);
    canvas.height = Math.round(image.height * factor);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas;
    texture.needsUpdate = true;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  if (id !== 'ring') { texture.wrapS = THREE.RepeatWrapping; }
  return texture;
}

// Lighting follows the true direction to the Sun at each body, regardless of camera or floating origin.
// Brightness is deliberately exposure-normalized rather than an inverse-square radiometric simulation.
function planetMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture }, sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      fillLight: { value: 0.025 },
    },
    vertexShader: `
      varying vec2 texUV;
      varying vec3 surfaceNormal;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        texUV = uv;
        surfaceNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 sunDirection;
      uniform float fillLight;
      varying vec2 texUV;
      varying vec3 surfaceNormal;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 light = normalize((viewMatrix * vec4(sunDirection, 0.)).xyz);
        float sunlight = max(dot(normalize(surfaceNormal), light), 0.);
        vec3 surface = texture2D(map, texUV).rgb;
        gl_FragColor = vec4(surface * (fillLight + 1.1 * sunlight), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function makeRing(texture, body) {
  const geo = new THREE.RingGeometry(body.ringInner / AU_KM, body.ringOuter / AU_KM, 256, 1);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i)) * AU_KM;
    // The supplied 8192x500 PNG is a radial strip: left=inner edge, right=outer.
    uv.setXY(i, (r - body.ringInner) / (body.ringOuter - body.ringInner), 0.5);
  }
  const material = new THREE.MeshBasicMaterial({
    map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.86,
    depthWrite: false, alphaTest: 0.015,
  });
  const ring = new THREE.Mesh(geo, material);
  ring.rotation.x = -Math.PI / 2; // The ring's normal is the body's local +Y.
  ring.renderOrder = 1;
  return ring;
}
function makeBody(body, texture, ringTexture) {
  const group = new THREE.Group();
  const material = body.id === 'Sun'
    ? new THREE.MeshBasicMaterial({ map: texture })
    : planetMaterial(texture);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
  mesh.scale.set(body.radius / AU_KM, body.polar / AU_KM, body.radius / AU_KM);
  group.add(mesh);
  if (body.ringOuter) group.add(makeRing(ringTexture, body));
  const axisLength = body.radius / AU_KM * 1.8;
  const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0),
  ]), new THREE.LineBasicMaterial({ color: 0x829fb2, transparent: true, opacity: 0.7 }));
  axis.visible = axesVisible;
  group.add(axis);
  scene.add(group);

  const label = document.createElement('button');
  label.className = 'body-label';
  label.style.setProperty('--body-color', body.color);
  label.innerHTML = `<span class="label-name">${body.name}</span>`;
  label.title = `聚焦${body.name}（标记不是天体实际大小）`;
  label.addEventListener('click', () => selectBody(body.id));
  $('labels').appendChild(label);
  const nav = document.createElement('button');
  nav.className = 'nav-body';
  nav.style.setProperty('--body-color', body.color);
  nav.innerHTML = `<i class="nav-dot"></i><span>${body.name}</span><span class="nav-en">${body.en}</span>`;
  nav.addEventListener('click', () => selectBody(body.id));
  $('body-nav').appendChild(nav);
  nodes.set(body.id, { body, group, mesh, axis, label, nav, position: new THREE.Vector3(), orbit: null });
}

function makeStars() {
  const random = seededRandom(3901);
  const points = [], colors = [];
  for (let i = 0; i < 1600; i++) {
    const z = random() * 2 - 1, phi = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    points.push(180 * r * Math.cos(phi), 180 * z, 180 * r * Math.sin(phi));
    const c = 0.23 + random() ** 5 * 0.55;
    colors.push(c * 0.85, c * 0.92, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1, sizeAttenuation: false, vertexColors: true, depthWrite: false,
  }));
  stars.renderOrder = -5;
  scene.add(stars);
  return stars;
}
const stars = makeStars();
const belt = createAsteroidBelt();
scene.add(belt.group);

function rebuildOrbits() {
  const date = new Date(simulationTime);
  for (const [id, node] of nodes) {
    if (id === 'Sun') continue;
    const points = sampleOrbit(node.body, date, id === 'Moon' ? 128 : 256);
    if (node.orbit) { node.orbit.geometry.dispose(); node.orbit.geometry = new THREE.BufferGeometry().setFromPoints(points); }
    else {
      node.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: node.body.color, transparent: true, opacity: 0.23, depthWrite: false }));
      orbitRoot.add(node.orbit);
    }
  }
  lastOrbitEpoch = simulationTime;
  orbitRebuildPending = false;
}
function requestOrbits() {
  if (orbitRebuildPending) return;
  orbitRebuildPending = true;
  // Coalesce date/size/UI changes without calculating hundreds of positions in a click handler.
  setTimeout(rebuildOrbits, 0);
}
function updateBodies() {
  const date = new Date(simulationTime);
  for (const [id, node] of nodes) {
    const state = stateAt(id, date);
    node.position.copy(state.position);
    node.group.quaternion.copy(state.quaternion);
    if (id !== 'Sun') node.mesh.material.uniforms.sunDirection.value.copy(state.position).negate().normalize();
  }
  origin.copy(follow ? nodes.get(selected).position : new THREE.Vector3());
  for (const [id, node] of nodes) {
    node.group.position.copy(node.position).sub(origin);
    if (id === 'Moon' && node.orbit) node.orbit.position.copy(nodes.get('Earth').position);
  }
  orbitRoot.position.copy(origin).negate();
  if (belt.group.visible) belt.update(simulationTime, origin);
}
function viewDirection() {
  const dir = camera.position.clone().sub(controls.target).normalize();
  return dir.lengthSq() ? dir : new THREE.Vector3(0.2, 0.5, 1).normalize();
}
function setViewButton(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
}
function setCameraDistance(distance, direction) {
  controls.target.set(0, 0, 0);
  camera.position.copy(direction).normalize().multiplyScalar(distance);
  controls.minDistance = visibleRadius(BODY_BY_ID[follow ? selected : 'Sun']) * 1.15;
  camera.near = Math.max(1e-10, distance / 20000);
  controls.update();
}
function visibleRadius(body) {
  return appearanceRadius(body, sizeScale);
}
function focusSelected() {
  follow = true;
  updateBodies();
  const body = BODY_BY_ID[selected];
  // Observe from its sunlit side, while keeping the world/ecliptic orientation fixed.
  const direction = body.id === 'Sun' ? new THREE.Vector3(0.3, 0.45, 1)
    : nodes.get(selected).position.clone().negate().normalize().add(new THREE.Vector3(0.35, 0.38, 0.25));
  const aspectCorrection = Math.max(1, 1 / camera.aspect);
  setCameraDistance(visibleRadius(body) * 7.5 * aspectCorrection, direction);
  setViewButton('focus');
  updateCard();
}
function selectBody(id) {
  selected = id;
  for (const [key, node] of nodes) {
    node.nav.classList.toggle('active', key === id);
    node.nav.setAttribute('aria-current', key === id ? 'true' : 'false');
    node.label.classList.toggle('selected', key === id);
  }
  focusSelected();
}
function overview(view) {
  const topDistance = camera.position.distanceTo(controls.target);
  const direction = view === 'top' ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0, 0.68, 1);
  follow = false;
  updateBodies();
  let distance = (view === 'inner' ? 5.7 : 88) * Math.max(1, 1.4 / camera.aspect);
  if (view === 'top') distance = Math.max(topDistance, currentView === 'inner' ? 5.7 : 78);
  setCameraDistance(distance, direction);
  setViewButton(view);
}
function applySize(scale) {
  if (!SIZE_OPTIONS.includes(scale) || scale === sizeScale) return;
  const oldScale = sizeScale;
  sizeScale = scale;
  const retreated = applyAppearanceScale({
    nodes, camera, controls, scale, previousScale: oldScale,
    focusId: follow ? selected : null, viewportHeight: innerHeight,
  });
  document.querySelectorAll('[data-scale]').forEach(button => {
    const active = Number(button.dataset.scale) === scale;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('size-label').textContent = `×${scale}`;
  $('appearance-note').hidden = scale === 1;
  $('magnify-warning').hidden = scale === 1;
  controls.update();
  if (scale !== 1) {
    const hint = retreated ? '镜头过近，已避让以防穿入或严重裁切。'
      : '太阳遮挡内侧行星时可切换“内太阳系”。';
    notify(`原位观察 ${scale}×：太阳与行星已同步放大（非真实尺寸倍数），中心与轨道不变。${hint}`);
  }
  updateCard();
}
const num = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
function periodText(days) {
  if (!days) return '—';
  const abs = Math.abs(days);
  return abs < 2 ? `${num(abs * 24)} 小时` : abs < 730 ? `${num(abs)} 天` : `${num(abs / 365.25)} 年`;
}
function updateCard() {
  const body = BODY_BY_ID[selected], index = BODIES.indexOf(body);
  $('body-name').innerHTML = `${body.name}<span>${body.en}</span>`;
  $('body-type').textContent = body.type;
  $('body-number').textContent = String(index).padStart(2, '0');
  $('body-description').textContent = body.description;
  $('body-radius').textContent = `${num(body.radius)} km`;
  $('body-distance').textContent = `${nodes.get(selected).position.length().toFixed(5)} AU`;
  $('distance-title').textContent = '当前日心距离';
  if (selected === 'Moon') {
    $('distance-title').textContent = '当前地心距离';
    $('body-distance').textContent = `${num(nodes.get('Moon').position.distanceTo(nodes.get('Earth').position) * AU_KM)} km`;
  }
  $('period-title').textContent = selected === 'Moon' ? '绕地球恒星周期' : '恒星公转周期';
  $('body-period').textContent = periodText(body.period);
  $('body-rotation').textContent = `${periodText(body.rotation)}${body.rotation < 0 ? ' · 逆行' : ''}`;
  $('body-tilt').textContent = `${body.tilt}°`;
  $('focus-card').textContent = `近距离观察${body.name} ↗`;
  $('venus-surface').hidden = selected !== 'Venus';
}
function utcInput(time) { return new Date(time).toISOString().slice(0, 19); }
function updateTimeUI() {
  const iso = new Date(simulationTime).toISOString();
  $('simulation-time').textContent = `${iso.slice(0, 10)}  ${iso.slice(11, 19)}`;
  $('simulation-time').dateTime = iso;
  $('time-state').textContent = !running ? '模拟已暂停' : speed === 1 ? '实时速率 · 1 秒 / 秒' : `统一加速 ×${num(speed)}`;
  updateCard();
}
function setRunning(value) {
  running = value;
  $('play-pause').textContent = running ? 'Ⅱ' : '▶';
  $('play-pause').setAttribute('aria-label', running ? '暂停模拟' : '继续模拟');
  updateTimeUI();
}
function jumpTo(time) {
  if (!Number.isFinite(time) || time < MIN_TIME || time > MAX_TIME) {
    notify('请选择 1900—2100 年内的有效 UTC 时刻。'); return;
  }
  simulationTime = time;
  $('date-input').value = utcInput(time);
  updateBodies();
  updateTimeUI();
  requestOrbits();
}
function updateLabels() {
  const used = [];
  const projected = new THREE.Vector3();
  const order = [...nodes.values()].sort((a, b) => (b.body.id === selected) - (a.body.id === selected));
  for (const node of order) {
    projected.copy(node.group.position).project(camera);
    const x = (projected.x + 1) * innerWidth / 2, y = (1 - projected.y) * innerHeight / 2;
    const depth = -node.group.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const pixelRadius = appearanceRadius(node.body, 1) * node.group.scale.x
      / Math.max(camera.near, depth) * innerHeight / (2 * Math.tan(camera.getEffectiveFOV() * Math.PI / 360));
    const labelX = x + Math.max(4, pixelRadius + 5), labelY = y - 10;
    const out = !labelsVisible || projected.z < -1 || projected.z > 1 || x < 0 || x > innerWidth || y < 76 || y > innerHeight - 112;
    const overlaps = used.some(p => Math.abs(p.x - labelX) < 57 && Math.abs(p.y - labelY) < 20);
    // Tiny Moon label is hidden in full overview rather than covering Earth's label.
    const closeMoon = node.body.id === 'Moon' && selected !== 'Moon' &&
      camera.position.distanceTo(nodes.get('Earth').group.position) > 0.07;
    node.label.hidden = out || closeMoon || overlaps;
    if (!node.label.hidden) {
      node.label.style.transform = `translate(${Math.round(labelX)}px,${Math.round(labelY)}px)`;
      used.push({ x: labelX, y: labelY });
    }
  }
}
function updateRuler() {
  const distance = camera.position.distanceTo(controls.target);
  const worldPerPixel = 2 * distance * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
  const target = worldPerPixel * 100;
  const power = 10 ** Math.floor(Math.log10(target));
  const length = [1, 2, 5, 10].map(v => v * power).find(v => v >= target) || power * 10;
  document.querySelector('.ruler-line').style.width = `${Math.round(length / worldPerPixel)}px`;
  $('ruler-label').textContent = length >= 0.01 ? `${num(length)} AU` : `${num(length * AU_KM)} km`;
}
function safeCamera() {
  // Prevent crossing the focused surface even after manual panning.
  const body = BODY_BY_ID[follow ? selected : 'Sun'];
  const centre = follow ? new THREE.Vector3() : nodes.get('Sun').group.position;
  const offset = camera.position.clone().sub(centre);
  const min = radiusAU(body, sizeScale) * 1.12;
  if (offset.length() < min) camera.position.copy(centre).add(offset.setLength(min));
  const distance = camera.position.distanceTo(controls.target);
  camera.near = Math.max(1e-10, Math.min(0.1, distance / 20000));
  camera.updateProjectionMatrix();
}
function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = Math.max(0, (now - lastFrame) / 1000);
  lastFrame = now;
  if (modes.active === 'sem') {
    modes.teaching.update(elapsed);
    controls.update();
    renderer.render(modes.teaching.scene, camera);
    return;
  }
  if (running) {
    // Do not clamp real-time elapsed seconds: a hidden tab still tracks the same simulated clock.
    const next = simulationTime + elapsed * speed * 1000;
    simulationTime = Math.min(MAX_TIME, Math.max(MIN_TIME, next));
    if (next !== simulationTime) { setRunning(false); notify('已到达星历展示的时间边界（1900—2100 年）。'); }
  }
  updateBodies();
  if (Math.abs(simulationTime - lastOrbitEpoch) > DAY_MS * 365) requestOrbits();
  controls.update();
  safeCamera();
  updateAppearanceForView({ nodes, camera, scale: sizeScale, viewportHeight: innerHeight });
  stars.position.copy(camera.position);
  renderer.render(scene, camera);
  updateLabels();
  updateRuler();
  if (now - lastUI > 250) { updateTimeUI(); lastUI = now; }
}

async function init() {
  let completed = 0;
  const entries = await Promise.all(Object.entries(textureURLs).filter(([key]) => key !== 'venusSurface').map(async ([key, url]) => {
    let texture;
    try { texture = await loadTexture(url, key); }
    catch (error) {
      console.error(`Texture failed: ${key}`, error);
      notify(`${BODY_BY_ID[key]?.name || '土星环'}贴图加载失败，暂用基础颜色。`, 12000);
      const color = new THREE.Color(BODY_BY_ID[key]?.color || '#c2b6a2');
      texture = new THREE.DataTexture(new Uint8Array([color.r * 255, color.g * 255, color.b * 255, 255]), 1, 1, THREE.RGBAFormat);
      texture.needsUpdate = true;
    }
    $('loading-text').textContent = `正在载入行星贴图 · ${++completed} / 11`;
    return [key, texture];
  }));
  const textures = Object.fromEntries(entries);
  loadedTextures = textures;
  for (const body of BODIES) makeBody(body, textures[body.id], textures.ring);
  simulationTime = Math.min(MAX_TIME, Math.max(MIN_TIME, Date.now()));
  rebuildOrbits();
  updateBodies();
  nodes.get('Sun').nav.classList.add('active');
  nodes.get('Sun').label.classList.add('selected');
  overview('all');
  $('date-input').value = utcInput(simulationTime);
  updateTimeUI();
  bindEvents();
  updateDOM();
  if (location.hash === '#sem') await modes.switchTo('sem');
  $('loading').classList.add('done');
  $('loading').setAttribute('aria-hidden', 'true');
  lastFrame = performance.now();
  requestAnimationFrame(animate);
}
function bindEvents() {
  document.querySelectorAll('button[data-mode]').forEach(button => {
    button.addEventListener('click', () => modes.switchTo(button.dataset.mode));
  });
  addEventListener('hashchange', () => modes.switchTo(location.hash === '#sem' ? 'sem' : 'solar'));
  $('lang-toggle').addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
  document.querySelectorAll('[data-scale]').forEach(button => button.addEventListener('click', () => applySize(Number(button.dataset.scale))));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => overview(button.dataset.view)));
  $('focus-card').addEventListener('click', focusSelected);
  $('refocus').addEventListener('click', focusSelected);
  $('toggle-labels').addEventListener('change', e => { labelsVisible = e.target.checked; });
  $('toggle-orbits').addEventListener('change', e => { orbitRoot.visible = e.target.checked; });
  $('toggle-axes').addEventListener('change', e => {
    axesVisible = e.target.checked;
    for (const node of nodes.values()) node.axis.visible = axesVisible;
  });
  $('toggle-belt').addEventListener('change', e => {
    belt.group.visible = e.target.checked;
    $('toggle-belt-markers').disabled = !e.target.checked;
  });
  $('toggle-belt-markers').addEventListener('change', e => { belt.markers.visible = e.target.checked; });
  $('time-speed').addEventListener('change', e => {
    speed = Number(e.target.value);
    setRunning(true);
    if (speed >= 86400) notify('所有天体统一加速；高速下，自转可能出现帧采样造成的视觉混叠。');
  });
  $('play-pause').addEventListener('click', () => setRunning(!running));
  $('time-now').addEventListener('click', () => {
    speed = 1; $('time-speed').value = '1'; jumpTo(Date.now()); setRunning(true);
  });
  $('date-form').addEventListener('submit', e => {
    e.preventDefault();
    // datetime-local has no zone: explicitly interpret its digits as UTC, never local time.
    const value = $('date-input').value;
    jumpTo(new Date(`${value}Z`).getTime());
  });
  const zoom = factor => {
    camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
    controls.update();
  };
  $('zoom-in').addEventListener('click', () => zoom(0.7));
  $('zoom-out').addEventListener('click', () => zoom(1 / 0.7));
  $('venus-surface').addEventListener('click', async () => {
    const button = $('venus-surface');
    button.disabled = true;
    try {
      if (!venusSurfaceTexture) venusSurfaceTexture = await loadTexture(textureURLs.venusSurface, 'venusSurface');
      venusSurface = !venusSurface;
      if (!venusSurface) {
        const cloud = nodes.get('Venus').cloudTexture;
        nodes.get('Venus').mesh.material.uniforms.map.value = cloud;
      } else {
        const node = nodes.get('Venus');
        if (!node.cloudTexture) node.cloudTexture = node.mesh.material.uniforms.map.value;
        node.mesh.material.uniforms.map.value = venusSurfaceTexture;
      }
      button.textContent = venusSurface ? '当前：地表 · 切换云层' : '当前：云层 · 切换地表';
    } catch { notify('金星地表贴图加载失败，请稍后重试。'); }
    finally { button.disabled = false; }
  });
  document.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (modes.active === 'sem') modes.teaching.toggleRunning();
      else setRunning(!running);
    }
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    modes.teaching?.resize(innerWidth, innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); setRunning(false); modes.teaching?.pause();
    notify('图形上下文已丢失，请刷新页面重新载入。', 60000);
  });
}
init().catch(error => {
  console.error(error);
  $('loading-text').textContent = '载入失败，请刷新重试；如持续失败，请检查浏览器控制台。';
});

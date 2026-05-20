import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

export function init({ scene, camera, controls, renderer, TILT, resolution, allLineMats }) {
  const semGroup = new THREE.Group();
  semGroup.visible = false;
  scene.add(semGroup);

  let semMode = false;
  let semSpeed = 1;
  let semEarthYear = 0;
  let semMoonMonth = 0;
  let semShowLabels = true;
  let semShowOrbits = true;
  let viewMode = 'orbit';
  let focusTarget = 'sun';

  /* 日地月尺寸配置：太阳半径2.0、地球轨道半径18、地球半径0.35、月球轨道半径1.2、月球半径0.095 */
  const SEM_SCALE = {
    sunR: 2.0, earthOrbitR: 18, earthR: 0.35, moonOrbitR: 1.2, moonR: 0.095,
  };

  const texLoader = new THREE.TextureLoader();

  /* ======== Sun ======== */
  const sunGeo = new THREE.SphereGeometry(SEM_SCALE.sunR, 64, 64);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // 太阳颜色（白色，加载贴图后被覆盖）
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  semGroup.add(sunMesh);

  texLoader.load('sem/sun.jpg', tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    sunMat.map = tex;
    sunMat.needsUpdate = true;
  });

  const sunGlowGeo = new THREE.SphereGeometry(SEM_SCALE.sunR * 1.25, 32, 32); // 太阳辉光球体大小（太阳的1.25倍）
  const sunGlowMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNorm;void main(){vNorm=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vNorm;void main(){float i=pow(0.65-dot(vNorm,vec3(0,0,1)),2.5);gl_FragColor=vec4(1.0,0.75,0.2,i*0.45);}`, // 辉光颜色（暖黄色），i*0.45 控制透明度
    transparent: true, side: THREE.BackSide, depthWrite: false
  });
  semGroup.add(new THREE.Mesh(sunGlowGeo, sunGlowMat));

  const sunLight = new THREE.PointLight(0xfffbe8, 800, 0, 2); // 太阳光源：强度800，衰减指数2
  semGroup.add(sunLight);
  semGroup.add(new THREE.AmbientLight(0x111122, 0.4)); // 环境光：暗蓝色，强度0.4

  /* ======== Earth ======== */
  const earthOrbitPivot = new THREE.Group();
  semGroup.add(earthOrbitPivot);

  const earthTiltGroup = new THREE.Group();
  earthTiltGroup.position.set(SEM_SCALE.earthOrbitR, 0, 0);
  earthOrbitPivot.add(earthTiltGroup);

  const semEarthGeo = new THREE.SphereGeometry(SEM_SCALE.earthR, 48, 48);
  const semEarthMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x000000, shininess: 15 }); // 地球表面光泽度15
  const semEarthMesh = new THREE.Mesh(semEarthGeo, semEarthMat);
  semEarthMesh.rotation.x = TILT;
  earthTiltGroup.add(semEarthMesh);

  texLoader.load('earth/earth.jpg', tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    semEarthMat.map = tex;
    semEarthMat.needsUpdate = true;
  });

  /* ======== Moon ======== */
  const moonOrbitPivot = new THREE.Group();
  moonOrbitPivot.position.set(0, 0, 0);
  earthTiltGroup.add(moonOrbitPivot);
  moonOrbitPivot.rotation.x = THREE.MathUtils.degToRad(5.14); // 月球轨道面相对黄道面的倾斜角5.14°

  const semMoonMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x000000, shininess: 5 }); // 月球表面光泽度5
  const semMoonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SEM_SCALE.moonR, 32, 32),
    semMoonMat
  );
  semMoonMesh.position.set(SEM_SCALE.moonOrbitR, 0, 0);
  semMoonMesh.rotation.y = Math.PI;
  moonOrbitPivot.add(semMoonMesh);

  texLoader.load('sem/moon.jpg', tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    semMoonMat.map = tex;
    semMoonMat.needsUpdate = true;
  });

  /* ======== Orbit lines ======== */
  function makeOrbitRing(radius, color, parent, segments) {
    segments = segments || 128;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(radius * Math.cos(a), 0, radius * Math.sin(a));
    }
    const geo = new LineGeometry(); geo.setPositions(pts);
    const mat = new LineMaterial({ color, linewidth: 1.2, transparent: true, opacity: 0.35, resolution, depthWrite: false }); // 轨道线：粗细1.2，透明度0.35
    const line = new Line2(geo, mat); line.computeLineDistances();
    parent.add(line); allLineMats.push(mat);
    return line;
  }
  const earthOrbitLine = makeOrbitRing(SEM_SCALE.earthOrbitR, 0x4488cc, semGroup, 256);   // 地球轨道线颜色：蓝色
  const moonOrbitLine = makeOrbitRing(SEM_SCALE.moonOrbitR, 0x888888, moonOrbitPivot, 64); // 月球轨道线颜色：灰色

  /* ======== Earth axis ======== */
  const axGeo = new THREE.CylinderGeometry(0.008, 0.008, SEM_SCALE.earthR * 2.8, 6); // 地轴线粗细0.008
  const axMesh = new THREE.Mesh(axGeo, new THREE.MeshBasicMaterial({ color: 0xff6666, transparent: true, opacity: 0.6 })); // 地轴线：红色，透明度0.6
  axMesh.rotation.x = TILT;
  earthTiltGroup.add(axMesh);

  /* ======== Labels ======== */
  function makeSEMLabel(text, color, size) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 36px PingFang SC,sans-serif';
    ctx.fillStyle = color || '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(size || 1.5, (size || 1.5) * 0.25, 1);
    return sp;
  }

  const semInfoLabels = [];

  /* ======== Solstice / Equinox markers ======== */
  const seasonAngles = {
    spring: 0,
    summer: Math.PI / 2,
    autumn: Math.PI,
    winter: 3 * Math.PI / 2
  };
  const seasonNames = { spring: '北分点', summer: '南至点', autumn: '南分点', winter: '北至点' }; // 分至点中文名
  const seasonColors = { spring: '#44cc66', summer: '#66aaff', autumn: '#cc8844', winter: '#ffaa22' }; // 分至点标记颜色

  const seasonMarkers = {};
  Object.entries(seasonAngles).forEach(([key, angle]) => {
    const x = SEM_SCALE.earthOrbitR * Math.cos(angle);
    const z = SEM_SCALE.earthOrbitR * Math.sin(angle);

    const dotGeo = new THREE.SphereGeometry(0.18, 12, 12); // 分至点标记球体大小0.18
    const dotMat = new THREE.MeshBasicMaterial({ color: seasonColors[key] });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(x, 0, z);
    semGroup.add(dot);

    const lbl = makeSEMLabel(seasonNames[key], seasonColors[key], 1.0); // 分至点标签大小1.0
    lbl.position.set(x, 0.6, z); // 标签悬浮高度0.6
    semGroup.add(lbl);

    seasonMarkers[key] = { angle, dot, lbl };
  });

  /* ======== Toggle SEM mode ======== */
  function toggleSEM(deps) {
    semMode = !semMode;
    semGroup.visible = semMode;
    document.getElementById('tb-sem').classList.toggle('active', semMode);

    if (semMode) {
      deps.closeAllPanels();
      if (deps.getInteriorMode()) deps.toggleInterior();
      if (deps.getMagneticMode()) deps.toggleMagnetic();
      deps.setActivePanel(null);

      deps.earth.visible = false;
      deps.boundaryGroup.visible = false;
      deps.volcanoGroup.visible = false;
      deps.gridGroup.visible = false;
      deps.magneticGroup.visible = false;
      deps.splitParent.visible = false;

      deps.setAutoRotate(false);
      deps.setManualPause(true);
      document.getElementById('pause-btn').textContent = '\u25B6';

      applyView('orbit');
      document.getElementById('sem-panel').classList.add('show');
    } else {
      deps.earth.visible = true;

      controls.target.set(0, 0, 0);
      controls.minDistance = 2.0;
      controls.maxDistance = 10;
      camera.position.set(0, 0, 3);
      camera.lookAt(0, 0, 0);
      controls.update();
      document.getElementById('sem-panel').classList.remove('show');
      viewMode = 'orbit';
    }
  }

  /* ======== View modes ======== */
  function applyView(mode) {
    viewMode = mode;
    document.getElementById('sem-view-orbit').classList.toggle('active', mode === 'orbit');
    document.getElementById('sem-view-rotate').classList.toggle('active', mode === 'rotate');

    if (mode === 'orbit') {
      focusTarget = 'sun';
      controls.target.set(0, 0, 0);
      controls.minDistance = 5;
      controls.maxDistance = 60;
      camera.position.set(0, 15, 30);
      camera.lookAt(0, 0, 0);
      controls.update();
    } else if (mode === 'rotate') {
      focusTarget = 'earth';
      controls.minDistance = 0.8;
      controls.maxDistance = 5;
      const ep = getEarthWorldPos();
      controls.target.copy(ep);
      camera.position.set(ep.x + 1.5, ep.y + 0.5, ep.z + 1.5);
      camera.lookAt(ep);
      controls.update();
    }
  }

  function applyFocus(target) {
    focusTarget = target;
    document.getElementById('sem-focus-sun').classList.toggle('active', target === 'sun');
    document.getElementById('sem-focus-earth').classList.toggle('active', target === 'earth');

    if (target === 'sun') {
      controls.target.set(0, 0, 0);
      controls.minDistance = 5;
      controls.maxDistance = 60;
      camera.position.set(0, 15, 30);
      camera.lookAt(0, 0, 0);
      controls.update();
    } else if (target === 'earth') {
      controls.minDistance = 0.5;
      controls.maxDistance = 5;
      const ep = getEarthWorldPos();
      controls.target.copy(ep);
      camera.position.set(ep.x + 0.8, ep.y + 0.4, ep.z + 0.8);
      camera.lookAt(ep);
      controls.update();
    }
  }

  function getEarthWorldPos() {
    const pos = new THREE.Vector3();
    semEarthMesh.getWorldPosition(pos);
    return pos;
  }

  function moveToSeason(key) {
    const angle = seasonAngles[key];
    semEarthYear = angle;
    semMoonMonth = angle * (365.25 / 27.32);
    earthOrbitPivot.rotation.y = semEarthYear;
    moonOrbitPivot.rotation.y = semMoonMonth;
    if (viewMode === 'rotate') {
      const ep = getEarthWorldPos();
      controls.target.copy(ep);
      camera.position.set(ep.x + 1.5, ep.y + 0.5, ep.z + 1.5);
      camera.lookAt(ep);
      controls.update();
    }
  }

  /* ======== Update ======== */
  function updateSEM(dt) {
    if (!semMode) return;

    if (viewMode === 'rotate') {
      semEarthMesh.rotation.y += 0.01 * semSpeed; // 自转模式：地球自转速度
    } else {
      const earthAngularSpeed = 0.15 * semSpeed; // 公转模式：地球公转角速度
      const moonAngularSpeed = earthAngularSpeed * (365.25 / 27.32);
      semEarthYear += earthAngularSpeed * dt;
      semMoonMonth += moonAngularSpeed * dt;
      earthOrbitPivot.rotation.y = semEarthYear;
      semEarthMesh.rotation.y += 0.02 * semSpeed; // 公转模式：地球自转速度
      moonOrbitPivot.rotation.y = semMoonMonth;
    }

    earthTiltGroup.rotation.y = -earthOrbitPivot.rotation.y;

    sunMesh.rotation.y += 0.002 * semSpeed; // 太阳自转速度

    if (focusTarget === 'earth' && viewMode !== 'rotate') {
      const ep = getEarthWorldPos();
      controls.target.lerp(ep, 0.08);
    }

    Object.values(seasonMarkers).forEach(m => { m.lbl.visible = semShowLabels; });
    earthOrbitLine.visible = semShowOrbits;
    moonOrbitLine.visible = semShowOrbits;
  }

  /* ======== Controls ======== */
  (function initSEMControls() {
    const speedSlider = document.getElementById('sem-speed');
    const speedVal = document.getElementById('sem-speed-val');
    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        semSpeed = parseFloat(speedSlider.value);
        speedVal.textContent = semSpeed.toFixed(1) + '\u00d7';
      });
    }

    const toggleLabelsBtn = document.getElementById('sem-toggle-labels');
    if (toggleLabelsBtn) {
      toggleLabelsBtn.classList.add('active');
      toggleLabelsBtn.addEventListener('click', () => {
        semShowLabels = !semShowLabels;
        toggleLabelsBtn.classList.toggle('active', semShowLabels);
      });
    }

    const toggleOrbitsBtn = document.getElementById('sem-toggle-orbits');
    if (toggleOrbitsBtn) {
      toggleOrbitsBtn.classList.add('active');
      toggleOrbitsBtn.addEventListener('click', () => {
        semShowOrbits = !semShowOrbits;
        toggleOrbitsBtn.classList.toggle('active', semShowOrbits);
      });
    }

    let semPaused = false;
    const semPauseBtn = document.getElementById('sem-pause');
    if (semPauseBtn) {
      semPauseBtn.addEventListener('click', () => {
        semPaused = !semPaused;
        semSpeed = semPaused ? 0 : parseFloat(speedSlider.value);
        semPauseBtn.textContent = semPaused ? '\u25B6 继续' : '\u23F8 暂停';
        semPauseBtn.classList.toggle('active', semPaused);
      });
    }

    const viewOrbitBtn = document.getElementById('sem-view-orbit');
    const viewRotateBtn = document.getElementById('sem-view-rotate');
    if (viewOrbitBtn) viewOrbitBtn.addEventListener('click', () => applyView('orbit'));
    if (viewRotateBtn) viewRotateBtn.addEventListener('click', () => applyView('rotate'));

    const focusSunBtn = document.getElementById('sem-focus-sun');
    const focusEarthBtn = document.getElementById('sem-focus-earth');
    if (focusSunBtn) focusSunBtn.addEventListener('click', () => applyFocus('sun'));
    if (focusEarthBtn) focusEarthBtn.addEventListener('click', () => applyFocus('earth'));

    Object.keys(seasonAngles).forEach(key => {
      const btn = document.getElementById('sem-' + key);
      if (btn) btn.addEventListener('click', () => moveToSeason(key));
    });
  })();

  return {
    semGroup,
    get semMode() { return semMode; },
    toggleSEM,
    updateSEM,
  };
}

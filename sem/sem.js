import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { t } from '../i18n/lang.js';

export function init({ scene, camera, controls, renderer, TILT, resolution, allLineMats, lngLatToVec3 }) {
  const semGroup = new THREE.Group();
  semGroup.visible = false;
  scene.add(semGroup);

  let semMode = false;
  let semSpeed = 1;
  let semEarthYear = 0;
  let semMoonMonth = 0;
  let semShowLabels = true;
  let semShowOrbits = true;
  let semShowSunlight = true;
  let viewMode = 'orbit';
  let focusTarget = 'sun';
  const earthFocusOffset = new THREE.Vector3(0.8, 0.4, -0.8);
  const earthFocusUp = new THREE.Vector3(0, 1, 0);
  let lastEarthFocusOrbitAngle = null;
  let earthFocusInteracting = false;

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

  /* ======== Latitude reference lines ======== */
  // 这些标线与地球表面保持同心，并随地球一起自转、公转。
  const latitudeGroup = new THREE.Group();
  latitudeGroup.renderOrder = 2;
  // 挂在地球网格本体上，确保标线与地球贴图同步自转。
  semEarthMesh.add(latitudeGroup);

  function makeLatitudeRing(latitude, color, opacity, linewidth) {
    const pts = [];
    const radius = SEM_SCALE.earthR * 1.018; // 略高于表面，避免与贴图发生闪烁
    for (let i = 0; i <= 256; i++) {
      const lng = -180 + (i / 256) * 360;
      const v = lngLatToVec3(lng, latitude, radius);
      pts.push(v.x, v.y, v.z);
    }
    const geo = new LineGeometry();
    geo.setPositions(pts);
    const mat = new LineMaterial({
      color,
      linewidth,
      transparent: true,
      opacity,
      resolution,
      depthWrite: false,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    latitudeGroup.add(line);
    allLineMats.push(mat);
    return line;
  }

  const latitudeDefinitions = [
    { key: 'equator', latitude: 0, color: 0x78aeb7, opacity: 0.9, linewidth: 2.0 },
    { key: 'tropicCancer', latitude: 23.4, color: 0xb4a37a, opacity: 0.86, linewidth: 1.7 },
    { key: 'tropicCapricorn', latitude: -23.4, color: 0xb4a37a, opacity: 0.86, linewidth: 1.7 },
    { key: 'arcticCircle', latitude: 66.5, color: 0xa89aa7, opacity: 0.86, linewidth: 1.7 },
    { key: 'antarcticCircle', latitude: -66.5, color: 0xa89aa7, opacity: 0.86, linewidth: 1.7 },
  ];

  const latitudeLabels = [];

  function makeLatitudeLabel(definition) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const draw = (text) => {
      const labelCtx = cv.getContext('2d');
      labelCtx.clearRect(0, 0, cv.width, cv.height);
      const fontSize = Math.min(36, Math.max(22, Math.floor(480 / Math.max(text.length, 1))));
      labelCtx.font = `bold ${fontSize}px PingFang SC,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      labelCtx.fillStyle = definition.labelColor;
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      labelCtx.fillText(text, cv.width / 2, cv.height / 2);
    };

    draw(t(`sem.${definition.key}`));
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    const labelSize = 0.38;
    sprite.scale.set(labelSize, labelSize * 0.19, 1);
    const labelPos = lngLatToVec3(-90, definition.latitude, SEM_SCALE.earthR * 1.08);
    sprite.position.copy(labelPos);
    latitudeGroup.add(sprite);
    latitudeLabels.push(sprite);

    sprite.userData.updateText = () => {
      draw(t(`sem.${definition.key}`));
      tex.needsUpdate = true;
    };
  }

  latitudeDefinitions.forEach(definition => {
    makeLatitudeRing(
      definition.latitude,
      definition.color,
      definition.opacity,
      definition.linewidth
    );
    definition.labelColor = `#${definition.color.toString(16).padStart(6, '0')}`;
    makeLatitudeLabel(definition);
  });

  window.addEventListener('langchange', () => {
    latitudeLabels.forEach(label => label.userData.updateText());
  });

  /* ======== Labels ======== */
  function makeSEMLabel(text, color, size) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    function drawLabel(labelText) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = 'bold 36px PingFang SC,sans-serif';
      ctx.fillStyle = color || '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labelText, 128, 32);
    }
    drawLabel(text);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(size || 1.5, (size || 1.5) * 0.25, 1);
    sp.userData.setText = labelText => {
      drawLabel(labelText);
      tex.needsUpdate = true;
    };
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
  function getSeasonName(key) { const map={spring:'sem3d.spring',summer:'sem3d.summer',autumn:'sem3d.autumn',winter:'sem3d.winter'}; return t(map[key]); }
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

    const lbl = makeSEMLabel(getSeasonName(key), seasonColors[key], 1.0); // 分至点标签大小1.0
    lbl.position.set(x, 0.6, z); // 标签悬浮高度0.6
    semGroup.add(lbl);

    seasonMarkers[key] = { angle, dot, lbl };
  });

  /* ======== Sunlight ray & direct-sun point ======== */
  const sunBeamOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.14, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xe2c98f,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  const sunBeamCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.035, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf0dca8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  semGroup.add(sunBeamOuter, sunBeamCore);

  const directPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xf0dca8,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  const directPointRing = new THREE.Mesh(
    new THREE.RingGeometry(0.045, 0.075, 32),
    new THREE.MeshBasicMaterial({
      color: 0xe2c98f,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  semEarthMesh.add(directPoint, directPointRing);
  const sunlightVisuals = [sunBeamOuter, sunBeamCore, directPoint, directPointRing];

  const worldEarthPos = new THREE.Vector3();
  const worldSunPos = new THREE.Vector3();
  const worldToSun = new THREE.Vector3();
  const localToSun = new THREE.Vector3();
  const beamStart = new THREE.Vector3();
  const beamEnd = new THREE.Vector3();
  const beamDirection = new THREE.Vector3();
  const beamMidpoint = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const inverseEarthQuaternion = new THREE.Quaternion();
  const inverseGroupQuaternion = new THREE.Quaternion();

  function updateSunlightVisuals() {
    semEarthMesh.getWorldPosition(worldEarthPos);
    sunMesh.getWorldPosition(worldSunPos);

    worldToSun.copy(worldSunPos).sub(worldEarthPos).normalize();
    inverseEarthQuaternion.copy(semEarthMesh.getWorldQuaternion(inverseEarthQuaternion)).invert();
    localToSun.copy(worldToSun).applyQuaternion(inverseEarthQuaternion).normalize();

    const pointRadius = SEM_SCALE.earthR * 1.018;
    directPoint.position.copy(localToSun).multiplyScalar(pointRadius);
    directPointRing.position.copy(localToSun).multiplyScalar(SEM_SCALE.earthR * 1.024);
    directPointRing.quaternion.setFromUnitVectors(zAxis, localToSun);

    beamStart.copy(worldSunPos).addScaledVector(worldToSun, -SEM_SCALE.sunR * 0.96);
    beamEnd.copy(worldEarthPos).addScaledVector(worldToSun, SEM_SCALE.earthR * 1.018);
    beamDirection.copy(beamEnd).sub(beamStart);
    const beamLength = beamDirection.length();
    beamDirection.normalize();
    beamMidpoint.copy(beamStart).add(beamEnd).multiplyScalar(0.5);

    inverseGroupQuaternion.copy(semGroup.getWorldQuaternion(inverseGroupQuaternion)).invert();
    const localBeamDirection = beamDirection.clone().applyQuaternion(inverseGroupQuaternion).normalize();
    const localBeamMidpoint = semGroup.worldToLocal(beamMidpoint.clone());
    [sunBeamOuter, sunBeamCore].forEach(beam => {
      beam.position.copy(localBeamMidpoint);
      beam.quaternion.setFromUnitVectors(yAxis, localBeamDirection);
      beam.scale.set(1, beamLength, 1);
    });
  }

  window.addEventListener('langchange', () => {
    Object.entries(seasonMarkers).forEach(([key, marker]) => marker.lbl.userData.setText(getSeasonName(key)));
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
      if(deps.earthquakeGroup) deps.earthquakeGroup.visible = false;
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
      if (viewMode === 'orbit') {
        // 地球中心的公转视角仍需允许拉远，才能看到太阳和完整轨道。
        controls.maxDistance = 60;
        setEarthFocusView();
      } else {
        controls.maxDistance = 5;
        const ep = getEarthWorldPos();
        controls.target.copy(ep);
        camera.position.set(ep.x + 1.5, ep.y + 0.5, ep.z + 1.5);
        camera.lookAt(ep);
        controls.update();
      }
    }
  }

  function getEarthWorldPos() {
    const pos = new THREE.Vector3();
    semEarthMesh.getWorldPosition(pos);
    return pos;
  }

  function setEarthFocusView() {
    const ep = getEarthWorldPos();
    const offset = earthFocusOffset.clone().applyAxisAngle(
      earthFocusUp,
      earthOrbitPivot.rotation.y
    );
    controls.target.copy(ep);
    camera.position.copy(ep).add(offset);
    camera.lookAt(ep);
    controls.update();
    lastEarthFocusOrbitAngle = earthOrbitPivot.rotation.y;
  }

  function reanchorEarthFocusView() {
    const ep = getEarthWorldPos();
    // 交互期间不让公转把镜头往前推；结束交互时只平移观察中心，
    // 保留用户刚刚调整好的距离和旋转角度。
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(ep);
    camera.position.copy(ep).add(offset);
    camera.lookAt(ep);
    controls.update();
    lastEarthFocusOrbitAngle = earthOrbitPivot.rotation.y;
  }

  function followEarthFocusView() {
    const currentAngle = earthOrbitPivot.rotation.y;
    if (lastEarthFocusOrbitAngle === null) {
      setEarthFocusView();
      return;
    }

    let delta = currentAngle - lastEarthFocusOrbitAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const ep = getEarthWorldPos();
    // 鼠标按住/拖拽期间也继续跟随地球公转；
    // 只旋转当前相机相对地球的偏移量，不重置距离和用户视角，
    // 因此既不会停在原地，也不会把镜头向前推进。
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(earthFocusUp, delta);
    controls.target.copy(ep);
    camera.position.copy(ep).add(offset);
    controls.update();
    lastEarthFocusOrbitAngle = currentAngle;
  }

  function moveToSeason(key) {
    const angle = seasonAngles[key];
    semEarthYear = angle;
    semMoonMonth = angle * (365.25 / 27.32);
    earthOrbitPivot.rotation.y = semEarthYear;
    moonOrbitPivot.rotation.y = semMoonMonth;
    if (focusTarget === 'earth' && viewMode === 'orbit') {
      setEarthFocusView();
    }
    updateSunlightVisuals();
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
      followEarthFocusView();
    }

    Object.values(seasonMarkers).forEach(m => { m.lbl.visible = semShowLabels; });
    latitudeGroup.visible = semShowLabels;
    latitudeLabels.forEach(label => { label.visible = semShowLabels; });
    sunlightVisuals.forEach(object => { object.visible = semShowSunlight; });
    updateSunlightVisuals();
    earthOrbitLine.visible = semShowOrbits;
    moonOrbitLine.visible = semShowOrbits;
  }

  /* ======== Controls ======== */
  controls.addEventListener('start', () => {
    earthFocusInteracting = true;
  });
  controls.addEventListener('end', () => {
    earthFocusInteracting = false;
    if (focusTarget === 'earth' && viewMode === 'orbit') {
      reanchorEarthFocusView();
    }
  });

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

    const toggleSunlightBtn = document.getElementById('sem-toggle-sunlight');
    if (toggleSunlightBtn) {
      toggleSunlightBtn.classList.add('active');
      toggleSunlightBtn.addEventListener('click', () => {
        semShowSunlight = !semShowSunlight;
        toggleSunlightBtn.classList.toggle('active', semShowSunlight);
        sunlightVisuals.forEach(object => { object.visible = semShowSunlight; });
      });
    }

    let semPaused = false;
    const semPauseBtn = document.getElementById('sem-pause');
    if (semPauseBtn) {
      semPauseBtn.addEventListener('click', () => {
        semPaused = !semPaused;
        semSpeed = semPaused ? 0 : parseFloat(speedSlider.value);
        semPauseBtn.textContent = semPaused ? t('sem.resume') : t('sem.pause');
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

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { SEM_SCALE, SEASON_ANGLES, createTeachingState, advanceTeachingState, setTeachingSeason } from './model.js';

// Scene-only API: no page IDs, global listeners, extra renderer, or animation loop.
export function createSEM({ scene, camera, controls, textures, translate: t, resolution = new THREE.Vector2(1, 1) }) {
  const TILT = THREE.MathUtils.degToRad(23.4);
  const state = createTeachingState();
  const allLineMats = [];
  const semGroup = new THREE.Group();
  semGroup.name = 'sem-teaching';
  semGroup.visible = false;
  scene.add(semGroup);
  const earthFocusOffset = new THREE.Vector3(0.8, 0.4, -0.8);
  function lngLatToVec3(lng, lat, r) {
    const phi = (90 - lat) * Math.PI / 180, theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.cos(theta) * Math.sin(phi), r * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi));
  }

  /* ======== Sun ======== */
  const sunGeo = new THREE.SphereGeometry(SEM_SCALE.sunR, 64, 64);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // 太阳颜色（白色，加载贴图后被覆盖）
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.name = 'sem-sun';
  semGroup.add(sunMesh);

  sunMat.map = textures.Sun;
  sunMat.needsUpdate = true;

  const sunGlowGeo = new THREE.SphereGeometry(SEM_SCALE.sunR * 1.25, 32, 32); // 太阳辉光球体大小（太阳的1.25倍）
  const sunGlowMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNorm;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vNorm=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      varying vec3 vNorm;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float i=pow(max(0.,0.65-dot(vNorm,vec3(0,0,1))),2.5);
        gl_FragColor=vec4(1.0,0.75,0.2,i*0.45);
      }`, // 辉光颜色（暖黄色），i*0.45 控制透明度
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
  semEarthMesh.name = 'sem-earth';
  earthTiltGroup.add(semEarthMesh);

  semEarthMat.map = textures.Earth;
  semEarthMat.needsUpdate = true;

  /* ======== Earth atmosphere glow ======== */
  // 用一层很薄的淡蓝色 Fresnel 辉光勾勒地球轮廓，让背向太阳的一侧
  // 不会与黑色宇宙背景融为一体。可视厚度约为 0.008 个场景单位。
  const earthAtmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(SEM_SCALE.earthR + 0.008, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x79c9ff) },
        glowOpacity: { value: 0.46 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 glowColor;
        uniform float glowOpacity;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float edge = 1.0 - abs(dot(normalize(vWorldNormal), viewDirection));
          float rim = pow(max(edge, 0.0), 2.4);
          gl_FragColor = vec4(glowColor, rim * glowOpacity);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  earthAtmosphere.renderOrder = 1;
  semEarthMesh.add(earthAtmosphere);

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

  semMoonMat.map = textures.Moon;
  semMoonMat.needsUpdate = true;

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
  axMesh.name = 'sem-axis';
  earthTiltGroup.add(axMesh);

  /* ======== Latitude reference lines ======== */
  // 这些标线与地球表面保持同心，并随地球一起自转、公转。
  const latitudeGroup = new THREE.Group();
  latitudeGroup.renderOrder = 2;
  // 挂在地球网格本体上，确保标线与地球贴图同步自转。
  latitudeGroup.name = 'sem-latitudes';
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


  /* ======== Solstice / Equinox markers ======== */
  const seasonAngles = SEASON_ANGLES;
  function getSeasonName(key) { const map={spring:'sem3d.spring',summer:'sem3d.summer',autumn:'sem3d.autumn',winter:'sem3d.winter'}; return t(map[key]); }
  const seasonColors = { spring: '#44cc66', summer: '#66aaff', autumn: '#cc8844', winter: '#ffaa22' }; // 分至点标记颜色

  const seasonMarkers = {};
  Object.entries(seasonAngles).forEach(([key, angle]) => {
    const x = SEM_SCALE.earthOrbitR * Math.cos(angle);
    // Positive Three.js Y rotation places Earth at negative Z. Markers must
    // use the same convention so a season's jump, label and switch agree.
    const z = -SEM_SCALE.earthOrbitR * Math.sin(angle);

    const dotGeo = new THREE.SphereGeometry(0.18, 12, 12); // 分至点标记球体大小0.18
    const dotMat = new THREE.MeshBasicMaterial({ color: seasonColors[key] });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.name = `sem-marker-${key}`;
    dot.position.set(x, 0, z);
    semGroup.add(dot);

    const lbl = makeSEMLabel(getSeasonName(key), seasonColors[key], 1.0); // 分至点标签大小1.0
    lbl.name = `sem-marker-label-${key}`;
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
  directPoint.name = 'sem-direct-point';
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

  /* ======== View modes ======== */
  function applyView(mode) {
    state.view = mode;

    if (mode === 'orbit') {
      state.focus = 'sun';
      controls.target.set(0, 0, 0);
      controls.minDistance = 5;
      controls.maxDistance = 60;
      camera.position.set(0, 15, 30);
      camera.lookAt(0, 0, 0);
      controls.update();
    } else if (mode === 'rotate') {
      state.focus = 'earth';
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
    state.focus = target;

    if (target === 'sun') {
      controls.target.set(0, 0, 0);
      controls.minDistance = 5;
      controls.maxDistance = 60;
      camera.position.set(0, 15, 30);
      camera.lookAt(0, 0, 0);
      controls.update();
    } else if (target === 'earth') {
      controls.minDistance = 0.5;
      if (state.view === 'orbit') {
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
    controls.target.copy(ep);
    // 保持相机偏移量在宇宙坐标系中固定，地球公转时只平移观察中心。
    // 这样地轴相对屏幕的方向保持不变，太阳可以自然地在视野中移动。
    camera.position.copy(ep).add(earthFocusOffset);
    camera.lookAt(ep);
    controls.update();
  }

  function followEarthFocusView() {
    const ep = getEarthWorldPos();
    // 只平移相机和观察目标，不旋转相机偏移量；
    // 保留用户的缩放、旋转和地轴的固定方向。
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(ep);
    camera.position.copy(ep).add(offset);
    controls.update();
  }

  function moveToSeason(key) {
    if (!setTeachingSeason(state, key)) return;
    syncBodies();
    // Seasonal jumps must keep Earth in view in rotation mode too, and must
    // not discard a manually chosen zoom/orbit offset.
    if (state.focus === 'earth') followEarthFocusView();
  }

  function syncBodies() {
    earthOrbitPivot.rotation.y = state.year;
    earthTiltGroup.rotation.y = -state.year;
    moonOrbitPivot.rotation.y = state.month;
    semEarthMesh.rotation.y = state.spin;
    sunMesh.rotation.y = state.sunSpin;
    Object.entries(seasonMarkers).forEach(([key, marker]) => {
      marker.dot.visible = state.showSeasons[key];
      marker.lbl.visible = state.showSeasons[key] && state.showLabels;
    });
    latitudeGroup.visible = state.showLabels;
    sunlightVisuals.forEach(object => { object.visible = state.showSunlight; });
    earthOrbitLine.visible = moonOrbitLine.visible = state.showOrbits;
    semGroup.updateMatrixWorld(true);
    updateSunlightVisuals();
  }

  function update(dt) {
    if (!state.active) return;
    advanceTeachingState(state, dt);
    syncBodies();
    if (state.focus === 'earth' && state.view !== 'rotate') followEarthFocusView();
  }

  let initialized = false;
  return {
    group: semGroup,
    getState: () => ({ ...state, showSeasons: { ...state.showSeasons } }),
    activate() {
      state.active = true;
      semGroup.visible = true;
      syncBodies();
      if (!initialized) {
        camera.near = 0.01; camera.far = 1000; camera.zoom = 1; camera.fov = 42;
        camera.updateProjectionMatrix();
        applyView('orbit');
        initialized = true;
      }
    },
    deactivate() { state.active = false; semGroup.visible = false; },
    applyView, applyFocus, moveToSeason, update,
    setSpeed(value) { if (Number.isFinite(value)) state.speed = THREE.MathUtils.clamp(value, 0, 5); },
    setRunning(value) { state.running = Boolean(value); },
    setLabels(value) { state.showLabels = Boolean(value); syncBodies(); },
    setOrbits(value) { state.showOrbits = Boolean(value); syncBodies(); },
    setSunlight(value) { state.showSunlight = Boolean(value); syncBodies(); },
    setSeasonVisible(key, value) {
      if (!Object.prototype.hasOwnProperty.call(SEASON_ANGLES, key)) return;
      state.showSeasons[key] = Boolean(value);
      syncBodies();
    },
    resize(width, height) { allLineMats.forEach(material => material.resolution.set(width, height)); },
    refreshLabels() {
      latitudeLabels.forEach(label => label.userData.updateText());
      Object.entries(seasonMarkers).forEach(([key, marker]) => marker.lbl.userData.setText(getSeasonName(key)));
    },
    dispose() {
      state.active = false;
      scene.remove(semGroup);
      const geometries = new Set(), materials = new Set(), canvasTextures = new Set();
      semGroup.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean)) {
          materials.add(material);
          if (material.map?.isCanvasTexture) canvasTextures.add(material.map);
        }
      });
      geometries.forEach(resource => resource.dispose());
      materials.forEach(resource => resource.dispose());
      canvasTextures.forEach(resource => resource.dispose());
      // Shared solar-system textures are owned by the host, never disposed here.
    },
  };
}

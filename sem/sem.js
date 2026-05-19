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

  const SEM_SCALE = {
    sunR: 2.0, earthOrbitR: 18, earthR: 0.35, moonOrbitR: 1.2, moonR: 0.095,
  };

  const sunGeo = new THREE.SphereGeometry(SEM_SCALE.sunR, 64, 64);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNorm;
      void main(){
        vUv = uv; vNorm = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying vec3 vNorm;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p){
        float v=0.0,a=0.5;
        for(int i=0;i<5;i++){v+=noise(p)*a;p*=2.1;a*=0.5;}
        return v;
      }
      void main(){
        vec2 uv=vUv;
        float n1=fbm(uv*6.0+vec2(uTime*0.02,0.0));
        float n2=fbm(uv*10.0-vec2(0.0,uTime*0.03));
        float n3=fbm(uv*3.0+vec2(uTime*0.01,uTime*0.015));
        vec3 hot=vec3(1.0,0.95,0.8); vec3 warm=vec3(1.0,0.7,0.2); vec3 mid=vec3(1.0,0.45,0.05);
        vec3 c=mix(hot,warm,n1); c=mix(c,mid,n2*0.4); c+=vec3(0.15,0.08,0.02)*n3;
        c=clamp(c,0.0,1.0);
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  semGroup.add(sunMesh);

  const sunGlowGeo = new THREE.SphereGeometry(SEM_SCALE.sunR * 1.3, 32, 32);
  const sunGlowMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec3 vNorm;void main(){vNorm=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vNorm;void main(){float i=pow(0.7-dot(vNorm,vec3(0,0,1)),2.0);gl_FragColor=vec4(1.0,0.7,0.2,i*0.5);}`,
    transparent: true, side: THREE.BackSide, depthWrite: false
  });
  semGroup.add(new THREE.Mesh(sunGlowGeo, sunGlowMat));

  semGroup.add(new THREE.PointLight(0xffffff, 2, 100));
  semGroup.add(new THREE.AmbientLight(0x222244, 0.3));

  const earthOrbitPivot = new THREE.Group();
  semGroup.add(earthOrbitPivot);

  const semEarthGeo = new THREE.SphereGeometry(SEM_SCALE.earthR, 48, 48);
  const semEarthMat = new THREE.MeshPhongMaterial({ color: 0x4488cc, emissive: 0x112233, shininess: 25 });
  const semEarthMesh = new THREE.Mesh(semEarthGeo, semEarthMat);
  semEarthMesh.position.set(SEM_SCALE.earthOrbitR, 0, 0);
  semEarthMesh.rotation.x = TILT;
  earthOrbitPivot.add(semEarthMesh);

  const texLoader = new THREE.TextureLoader();
  texLoader.load('earth/earth.jpg', tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    semEarthMat.map = tex; semEarthMat.color.set(0xffffff); semEarthMat.needsUpdate = true;
  });

  const moonOrbitPivot = new THREE.Group();
  moonOrbitPivot.position.set(SEM_SCALE.earthOrbitR, 0, 0);
  earthOrbitPivot.add(moonOrbitPivot);
  moonOrbitPivot.rotation.x = THREE.MathUtils.degToRad(5.14);

  const semMoonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SEM_SCALE.moonR, 32, 32),
    new THREE.MeshPhongMaterial({ color: 0xbbbbbb, emissive: 0x111111, shininess: 5 })
  );
  semMoonMesh.position.set(SEM_SCALE.moonOrbitR, 0, 0);
  moonOrbitPivot.add(semMoonMesh);

  function makeOrbitRing(radius, color, parent, segments){
    segments = segments || 128;
    const pts = [];
    for(let i = 0; i <= segments; i++){
      const a = (i / segments) * Math.PI * 2;
      pts.push(radius * Math.cos(a), 0, radius * Math.sin(a));
    }
    const geo = new LineGeometry(); geo.setPositions(pts);
    const mat = new LineMaterial({ color, linewidth: 1.2, transparent: true, opacity: 0.35, resolution, depthWrite: false });
    const line = new Line2(geo, mat); line.computeLineDistances();
    parent.add(line); allLineMats.push(mat);
    return line;
  }
  const earthOrbitLine = makeOrbitRing(SEM_SCALE.earthOrbitR, 0x4488cc, semGroup, 256);
  const moonOrbitLine = makeOrbitRing(SEM_SCALE.moonOrbitR, 0x888888, moonOrbitPivot, 64);

  const axGeo = new THREE.CylinderGeometry(0.008, 0.008, SEM_SCALE.earthR * 2.8, 6);
  const axMat = new THREE.MeshBasicMaterial({ color: 0xff6666, transparent: true, opacity: 0.6 });
  const axMesh = new THREE.Mesh(axGeo, axMat);
  axMesh.position.set(SEM_SCALE.earthOrbitR, 0, 0);
  axMesh.rotation.x = TILT;
  earthOrbitPivot.add(axMesh);

  function makeSEMLabel(text, color, size){
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

  const sunLabel = makeSEMLabel('太阳', '#FFD700', 2.5);
  sunLabel.position.set(0, SEM_SCALE.sunR + 0.8, 0);
  semGroup.add(sunLabel);

  const earthLabel = makeSEMLabel('地球', '#88ccff', 1.0);
  earthLabel.position.set(SEM_SCALE.earthOrbitR, SEM_SCALE.earthR + 0.3, 0);
  earthOrbitPivot.add(earthLabel);

  const moonLabel = makeSEMLabel('月球', '#cccccc', 0.6);
  moonLabel.position.set(SEM_SCALE.moonOrbitR, SEM_SCALE.moonR + 0.15, 0);
  moonOrbitPivot.add(moonLabel);

  const semInfoLabels = [];
  function makeSEMInfoLabel(text, pos, parent){
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = '24px PingFang SC,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(2.5, 0.32, 1);
    sp.position.copy(pos);
    parent.add(sp);
    semInfoLabels.push(sp);
    return sp;
  }
  makeSEMInfoLabel('公转轨道', new THREE.Vector3(0, -0.5, -SEM_SCALE.earthOrbitR), semGroup);
  makeSEMInfoLabel('自转轴倾斜23.4°', new THREE.Vector3(SEM_SCALE.earthOrbitR + 1.2, SEM_SCALE.earthR + 0.6, 0), earthOrbitPivot);

  function toggleSEM(deps){
    semMode = !semMode;
    semGroup.visible = semMode;
    document.getElementById('tb-sem').classList.toggle('active', semMode);

    if(semMode){
      deps.closeAllPanels();
      if(deps.getInteriorMode()) deps.toggleInterior();
      if(deps.getMagneticMode()) deps.toggleMagnetic();
      deps.setActivePanel(null);

      deps.earth.visible = false;
      deps.boundaryGroup.visible = false;
      deps.volcanoGroup.visible = false;
      deps.gridGroup.visible = false;
      deps.magneticGroup.visible = false;
      deps.splitParent.visible = false;

      deps.setAutoRotate(false);
      deps.setManualPause(true);
      document.getElementById('pause-btn').textContent = '▶';

      controls.target.set(0,0,0);
      controls.minDistance = 5;
      controls.maxDistance = 60;
      camera.position.set(0, 15, 30);
      camera.lookAt(0,0,0);
      controls.update();
      document.getElementById('sem-panel').classList.add('show');
    } else {
      deps.earth.visible = true;
      deps.boundaryGroup.visible = true;
      deps.volcanoGroup.visible = true;
      deps.gridGroup.visible = true;

      controls.target.set(0,0,0);
      controls.minDistance = 2.0;
      controls.maxDistance = 10;
      camera.position.set(0,0,3);
      camera.lookAt(0,0,0);
      controls.update();
      document.getElementById('sem-panel').classList.remove('show');
    }
  }

  function updateSEM(dt){
    if(!semMode) return;
    const earthAngularSpeed = 0.15 * semSpeed;
    const moonAngularSpeed = earthAngularSpeed * (365.25 / 27.32);
    const earthRotSpeed = earthAngularSpeed * 365.25;
    semEarthYear += earthAngularSpeed * dt;
    semMoonMonth += moonAngularSpeed * dt;
    earthOrbitPivot.rotation.y = semEarthYear;
    semEarthMesh.rotation.y = earthRotSpeed * performance.now() * 0.001 * 0.05;
    moonOrbitPivot.rotation.y = semMoonMonth;
    sunMat.uniforms.uTime.value = performance.now() * 0.001;
    [sunLabel, earthLabel, moonLabel, ...semInfoLabels].forEach(sp => { sp.visible = semShowLabels; });
    earthOrbitLine.visible = semShowOrbits;
    moonOrbitLine.visible = semShowOrbits;
  }

  /* SEM controls */
  (function initSEMControls(){
    const speedSlider = document.getElementById('sem-speed');
    const speedVal = document.getElementById('sem-speed-val');
    if(speedSlider){
      speedSlider.addEventListener('input', () => {
        semSpeed = parseFloat(speedSlider.value);
        speedVal.textContent = semSpeed.toFixed(1) + '×';
      });
    }
    const toggleLabelsBtn = document.getElementById('sem-toggle-labels');
    if(toggleLabelsBtn){
      toggleLabelsBtn.classList.add('active');
      toggleLabelsBtn.addEventListener('click', () => { semShowLabels = !semShowLabels; toggleLabelsBtn.classList.toggle('active', semShowLabels); });
    }
    const toggleOrbitsBtn = document.getElementById('sem-toggle-orbits');
    if(toggleOrbitsBtn){
      toggleOrbitsBtn.classList.add('active');
      toggleOrbitsBtn.addEventListener('click', () => { semShowOrbits = !semShowOrbits; toggleOrbitsBtn.classList.toggle('active', semShowOrbits); });
    }
    let semPaused = false;
    const semPauseBtn = document.getElementById('sem-pause');
    if(semPauseBtn){
      semPauseBtn.addEventListener('click', () => {
        semPaused = !semPaused;
        semSpeed = semPaused ? 0 : parseFloat(speedSlider.value);
        semPauseBtn.textContent = semPaused ? '▶ 继续' : '⏸ 暂停';
        semPauseBtn.classList.toggle('active', semPaused);
      });
    }
  })();

  return {
    semGroup,
    get semMode(){ return semMode; },
    toggleSEM,
    updateSEM,
  };
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { init as initEarth, lngLatToVec3 } from './earth/earth.js';
import { init as initMagnetic } from './magnetic/magnetic.js';
import { init as initSEM } from './sem/sem.js';
import { init as initPlates } from './plates/plates.js';
import { init as initSplit } from './plates/split.js';
import { init as initVolcanoes } from './volcanoes/volcanoes.js';
import { init as initInterior } from './interior/interior.js';

/* ══════════ Scene ══════════ */
const TILT = THREE.MathUtils.degToRad(23.4);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 0, 3);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2.0;
controls.maxDistance = 10;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;

const resolution = new THREE.Vector2(innerWidth, innerHeight);
const allLineMats = [];
const ctx = { scene, camera, controls, renderer, TILT, resolution, allLineMats, lngLatToVec3 };

/* ══════════ Shared State ══════════ */
let autoRotate = true, manualPause = false, idleTimer;
let activePanel = null;
let navAnim = null, savedView = null;

/* ══════════ Knowledge Card ══════════ */
const kcCard = document.getElementById('knowledge-card');
const kcTitle = document.getElementById('kc-title');
const kcDesc = document.getElementById('kc-desc');
const kcImg = document.getElementById('kc-img');
document.getElementById('kc-close').addEventListener('click', () => kcCard.classList.remove('show'));

function showKC(kc){
  kcTitle.textContent = kc.title;
  kcDesc.innerHTML = kc.desc || '';
  if(kc.img){ kcImg.src = kc.img; kcImg.style.display = 'block'; } else { kcImg.style.display = 'none'; }
  kcCard.classList.add('show');
}
function hideKC(){ kcCard.classList.remove('show'); }

/* ══════════ Init Modules ══════════ */
const { earth, earthMat, gridGroup } = initEarth(ctx);
const { magneticGroup } = initMagnetic(ctx);

let magneticMode = false;
function toggleMagnetic(){
  magneticMode = !magneticMode;
  magneticGroup.visible = magneticMode;
  document.getElementById('tb-magnetic').classList.toggle('active', magneticMode);
  if(magneticMode){
    closeAllPanels();
    if(interior.interiorMode) interior.toggleInterior();
    activePanel = null;
    boundaryGroup.visible = false;
    volcanoGroup.visible = false;
    gridGroup.visible = false;
    earthMat.uniforms.uOpacity.value = 0.35;
    earthMat.depthWrite = false;
  } else {
    boundaryGroup.visible = true;
    volcanoGroup.visible = true;
    gridGroup.visible = true;
    earthMat.uniforms.uOpacity.value = 1.0;
    earthMat.depthWrite = true;
  }
}

const semMod = initSEM(ctx);

function closeAllPanels(){
  document.getElementById('plates-panel').classList.remove('show');
  document.getElementById('volcano-panel').classList.remove('show');
  document.getElementById('sem-panel').classList.remove('show');
  document.getElementById('tb-plates').classList.remove('active');
  document.getElementById('tb-volcano').classList.remove('active');
  kcCard.classList.remove('show');
}

/* Navigation */
const pauseBtn = document.getElementById('pause-btn');

function navigateTo(lng,lat,dist){
  autoRotate=false;manualPause=true;pauseBtn.textContent='▶';
  const sph=new THREE.Spherical().setFromVector3(camera.position);
  const theta=(lng+180)*Math.PI/180;
  const localAz=Math.atan2(-Math.cos(theta),Math.sin(theta));
  const targetRotY=sph.theta-localAz;
  const targetPolar=Math.max(0.35,Math.min(2.8,(90-lat)*Math.PI/180));
  navAnim={rotY:targetRotY,phi:targetPolar,r:dist,theta:null};
  controls.enabled=false;
}
function zoomToVolcano(vd){
  savedView={camPos:camera.position.clone(),earthRotY:earth.rotation.y};
  autoRotate=false;manualPause=true;pauseBtn.textContent='▶';
  const vLocal=lngLatToVec3(vd.lon,vd.lat,1);
  const e=new THREE.Euler(TILT,earth.rotation.y,0,'XYZ');
  vLocal.applyEuler(e);
  const target=vLocal.normalize().multiplyScalar(1.8);
  const sph=new THREE.Spherical().setFromVector3(target);
  navAnim={rotY:earth.rotation.y,phi:sph.phi,r:sph.radius,theta:sph.theta};
  controls.enabled=false;
}
function restoreView(){
  if(!savedView)return;
  const sv=savedView;savedView=null;
  const sph=new THREE.Spherical().setFromVector3(sv.camPos);
  navAnim={rotY:sv.earthRotY,phi:sph.phi,r:sph.radius,theta:sph.theta};
  controls.enabled=false;
}

/* Shared deps object for modules that need cross-references */
const sharedDeps = {
  earth, earthMat, gridGroup, magneticGroup,
  showKC, hideKC,
  get boundaryGroup(){ return boundaryGroup; },
  get bPairs(){ return plates ? plates.bPairs : []; },
  get splitBtn(){ return plates ? plates.splitBtn : null; },
  navigateTo, zoomToVolcano, restoreView,
  getInteriorMode: () => interior ? interior.interiorMode : false,
  getMagneticMode: () => magneticMode,
  getSplitActive: () => split ? split.splitActive : false,
  toggleInterior: () => interior && interior.toggleInterior(),
  toggleMagnetic,
  toggleSplit: () => split && split.toggleSplit(),
  interiorHover: (rc,x,y) => interior ? interior.interiorHover(rc,x,y) : false,
  closeAllPanels,
  setActivePanel: (v) => { activePanel = v; },
  setAutoRotate: (v) => { autoRotate = v; },
  setManualPause: (v) => { manualPause = v; },
  clearPlateHighlight: () => plates && plates.clearPlateHighlight(),
  get plates(){ return plates; },
  get volcanoGroup(){ return volcanoGroup; },
  get splitParent(){ return split ? split.splitParent : null; },
};

/* Async module init */
let boundaryGroup, volcanoGroup, plates, split, volcano, interior;

(async function bootstrap(){
  [plates, split, volcano, interior] = await Promise.all([
    initPlates(ctx, sharedDeps),
    initSplit(ctx, sharedDeps),
    initVolcanoes(ctx, sharedDeps),
    Promise.resolve(initInterior(ctx, sharedDeps)),
  ]);

  boundaryGroup = plates.boundaryGroup;
  volcanoGroup = volcano.volcanoGroup;

  /* Wire up SEM deps (needs all groups) */
  const semToggleDeps = {
    closeAllPanels,
    getInteriorMode: () => interior.interiorMode,
    getMagneticMode: () => magneticMode,
    toggleInterior: () => interior.toggleInterior(),
    toggleMagnetic,
    setActivePanel: (v) => { activePanel = v; },
    earth, boundaryGroup, volcanoGroup: volcano.volcanoGroup,
    gridGroup, magneticGroup,
    splitParent: split.splitParent,
    setAutoRotate: (v) => { autoRotate = v; },
    setManualPause: (v) => { manualPause = v; },
  };

  /* Panel toggle */
  const panelMap = {plates:'plates-panel', volcano:'volcano-panel'};
  function togglePanel(name){
    if(magneticMode) toggleMagnetic();
    if(semMod.semMode) semMod.toggleSEM(semToggleDeps);
    if(name==='interior'){
      closeAllPanels();
      activePanel = interior.interiorMode ? null : 'interior';
      interior.toggleInterior();
      return;
    }
    if(interior.interiorMode) interior.toggleInterior();
    const panel=document.getElementById(panelMap[name]);
    const btn=document.getElementById('tb-'+name);
    if(activePanel===name){
      panel.classList.remove('show');btn.classList.remove('active');activePanel=null;
      hideKC();
    } else {
      closeAllPanels();
      panel.classList.add('show');btn.classList.add('active');activePanel=name;
    }
  }

  document.getElementById('tb-plates').addEventListener('click', () => togglePanel('plates'));
  document.getElementById('tb-volcano').addEventListener('click', () => togglePanel('volcano'));
  document.getElementById('tb-interior').addEventListener('click', () => togglePanel('interior'));
  document.getElementById('tb-magnetic').addEventListener('click', () => {
    if(semMod.semMode) semMod.toggleSEM(semToggleDeps);
    if(interior.interiorMode) interior.toggleInterior();
    closeAllPanels();
    toggleMagnetic();
  });
  document.getElementById('tb-sem').addEventListener('click', () => {
    if(magneticMode) toggleMagnetic();
    if(interior.interiorMode) interior.toggleInterior();
    closeAllPanels();
    semMod.toggleSEM(semToggleDeps);
  });

  /* Pause / Reset */
  document.getElementById('reset-view-btn').addEventListener('click', () => {
    earth.rotation.y=0;syncRotY();
    camera.position.set(0,0,3);camera.lookAt(controls.target);
    controls.update();navAnim=null;savedView=null;
  });
  pauseBtn.addEventListener('click', () => {
    manualPause=!manualPause;autoRotate=!manualPause;
    pauseBtn.textContent=manualPause?'▶':'⏸';
    if(manualPause)clearTimeout(idleTimer);
  });
  controls.addEventListener('start', () => {autoRotate=false;clearTimeout(idleTimer);});
  controls.addEventListener('end', () => {clearTimeout(idleTimer);if(!manualPause)idleTimer=setTimeout(()=>{autoRotate=true;},3000);});

  /* Double-click Zoom */
  renderer.domElement.addEventListener('dblclick', e => {
    e.preventDefault();
    if(interior.interiorMode) return;
    const mx=(e.clientX/innerWidth)*2-1,my=-(e.clientY/innerHeight)*2+1;
    const rc=new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx,my),camera);
    const hits=rc.intersectObject(earth);
    if(hits.length>0){
      const p=hits[0].point.clone();
      const sph=new THREE.Spherical().setFromVector3(p.normalize().multiplyScalar(2.0));
      savedView=savedView||{camPos:camera.position.clone(),earthRotY:earth.rotation.y};
      navAnim={rotY:earth.rotation.y,phi:sph.phi,r:2.0,theta:sph.theta};
      autoRotate=false;manualPause=true;pauseBtn.textContent='▶';
      controls.enabled=false;
    }
  });

  /* Resize */
  window.addEventListener('resize', () => {
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);resolution.set(innerWidth,innerHeight);
    allLineMats.forEach(m=>m.resolution.copy(resolution));
  });

  /* ══════════ Animate ══════════ */
  function syncRotY(){
    boundaryGroup.rotation.y = earth.rotation.y;
    volcano.volcanoGroup.rotation.y = earth.rotation.y;
    gridGroup.rotation.y = earth.rotation.y;
    split.splitParent.rotation.y = earth.rotation.y;
    magneticGroup.rotation.y = earth.rotation.y;
  }

  (function animate(){
    requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    if(navAnim){
      let done=true;
      let dy=navAnim.rotY-earth.rotation.y;
      while(dy>Math.PI)dy-=2*Math.PI;while(dy<-Math.PI)dy+=2*Math.PI;
      if(Math.abs(dy)>0.003){earth.rotation.y+=dy*0.06;done=false;}
      syncRotY();
      const sph=new THREE.Spherical().setFromVector3(camera.position);
      if(navAnim.phi!=null){const dp=navAnim.phi-sph.phi;if(Math.abs(dp)>0.003){sph.phi+=dp*0.06;done=false;}}
      if(navAnim.r!=null){const dr=navAnim.r-sph.radius;if(Math.abs(dr)>0.01){sph.radius+=dr*0.06;done=false;}}
      if(navAnim.theta!=null){let dt=navAnim.theta-sph.theta;while(dt>Math.PI)dt-=2*Math.PI;while(dt<-Math.PI)dt+=2*Math.PI;if(Math.abs(dt)>0.003){sph.theta+=dt*0.06;done=false;}}
      camera.position.setFromSpherical(sph);camera.lookAt(controls.target);
      if(done){navAnim=null;controls.enabled=true;controls.update();}
    } else {
      if(autoRotate && !interior.interiorMode){earth.rotation.y+=0.001;syncRotY();}
      controls.update();
    }

    split.updateSplit(earthMat, boundaryGroup);
    volcano.updatePulse(t);
    interior.updateTime(t);
    semMod.updateSEM(0.016);
    earthMat.uniforms.uCam.value.copy(camera.position);
    renderer.render(scene, camera);
  })();
})();

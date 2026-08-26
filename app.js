import './guard.js';
import { t, getLang, setLang, updateDOM } from './i18n/lang.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { init as initEarth, lngLatToVec3 } from './earth/earth.js';
import { init as initMagnetic } from './earth_function/magnetic/magnetic.js';
import { init as initSEM } from './sem/sem.js';
import { init as initPlates } from './earth_function/plates/plates.js';
import { init as initSplit } from './earth_function/plates/split.js';
import { init as initVolcanoes } from './earth_function/volcanoes/volcanoes.js';
import { init as initInterior } from './earth_function/interior/interior.js';
import { init as initEarthquakes } from './earth_function/earthquakes/earthquakes.js';
import { loadApprovedPhotos, initUploadModal } from './photos/photos.js';

/* ══════════ Scene — 场景、相机、渲染器初始化 ══════════ */
const TILT = THREE.MathUtils.degToRad(23.4); // 地轴倾斜角度（度）
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000); // 45=视场角，越大视野越广
camera.position.set(0, 0, 3); // 初始相机距离，值越大地球越小
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;  // 启用惯性阻尼
controls.dampingFactor = 0.05;  // 阻尼系数，值越小惯性越大
controls.minDistance = 2.0;  // 最小缩放距离（最近能拉多近）
controls.maxDistance = 10;   // 最大缩放距离（最远能拉多远）
controls.rotateSpeed = 0.5;  // 鼠标拖拽旋转速度
controls.zoomSpeed = 0.8;    // 滚轮缩放速度

const resolution = new THREE.Vector2(innerWidth, innerHeight);
const allLineMats = [];
const ctx = { scene, camera, controls, renderer, TILT, resolution, allLineMats, lngLatToVec3 };

/* ══════════ Shared State ══════════ */
let autoRotate = true, manualPause = false, idleTimer;
let activePanel = null;
let navAnim = null, savedView = null;
let currentMode = 'earth';

/* ══════════ Knowledge Card ══════════ */
const kcCard = document.getElementById('knowledge-card');
const kcTitle = document.getElementById('kc-title');
const kcDesc = document.getElementById('kc-desc');
const kcImg = document.getElementById('kc-img');
document.getElementById('kc-close').addEventListener('click', () => kcCard.classList.remove('show'));

// 显示知识卡片弹窗
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
// 切换磁场可视化模式（地球变半透明 + 显示磁力线）
function toggleMagnetic(){
  magneticMode = !magneticMode;
  magneticGroup.visible = magneticMode;
  document.getElementById('ep-magnetic').classList.toggle('active', magneticMode);
  if(magneticMode){
    if(interior && interior.interiorMode) interior.toggleInterior();
    if(boundaryGroup) boundaryGroup.visible = false;
    if(volcanoGroup) volcanoGroup.visible = false;
    if(earthquakeGroup) earthquakeGroup.visible = false;
    gridGroup.visible = false;
    earthMat.uniforms.uOpacity.value = 0.35; // 磁场模式下地球透明度（0=全透明，1=不透明）
    earthMat.depthWrite = false;
  } else {
    earthMat.uniforms.uOpacity.value = 1.0;
    earthMat.depthWrite = true;
  }
}

const semMod = initSEM(ctx);

function closeAllPanels(){
  document.getElementById('sem-panel').classList.remove('show');
  document.getElementById('earth-panel').classList.remove('show');
  kcCard.classList.remove('show');
}

/* ══════════ Accordion helpers ══════════ */
const SUB_IDS = ['plates-sub', 'volcano-sub', 'earthquake-sub', 'interior-sub'];
const EXPLORE_BTN_IDS = ['ep-plates', 'ep-volcano', 'ep-earthquake', 'ep-interior', 'ep-magnetic'];

function closeAllSubs(){
  SUB_IDS.forEach(id => document.getElementById(id).classList.remove('show'));
}

function deactivateAllExplore(){
  EXPLORE_BTN_IDS.forEach(id => document.getElementById(id).classList.remove('active'));
}

// 重置地球到默认状态（关闭所有叠加层和子面板）
function resetEarthState(){
  closeAllSubs();
  deactivateAllExplore();
  hideKC();
  if(interior && interior.interiorMode) interior.toggleInterior();
  if(magneticMode) toggleMagnetic();
  if(boundaryGroup) boundaryGroup.visible = false;
  if(volcanoGroup) volcanoGroup.visible = false;
  if(earthquakeGroup) earthquakeGroup.visible = false;
  gridGroup.visible = false;
  earthMat.uniforms.uBumpScale.value = 0.0; // 地形凹凸强度（0=平滑，值越大地形越凸显）
  document.getElementById('ep-terrain').classList.remove('active');
  document.getElementById('ep-show-plates').classList.remove('active');
  document.getElementById('ep-show-volcano').classList.remove('active');
  document.getElementById('ep-show-earthquake').classList.remove('active');
}

function autoMergeSplit(){
  if(!split) return;
  if(split.splitActive) split.toggleSplit();
  split.forceComplete(earthMat);
}

/* ══════════ SEM stacking cards ══════════ */
const semKcStack = document.getElementById('sem-kc-stack');
const activeSemCards = new Map();
const SEM_SEASON_BTNS = ['sem-spring','sem-summer','sem-autumn','sem-winter'];
const SEM_VIEW_BTNS = ['sem-view-orbit','sem-view-rotate'];

function removeSemKC(btnId){
  if(!activeSemCards.has(btnId)) return;
  const card = activeSemCards.get(btnId);
  card.remove();
  activeSemCards.delete(btnId);
  if(SEM_SEASON_BTNS.includes(btnId)){
    document.getElementById(btnId).classList.remove('active');
  }
}

function toggleSemKC(btnId, data){
  if(activeSemCards.has(btnId)){
    removeSemKC(btnId);
  } else {
    if(SEM_SEASON_BTNS.includes(btnId)){
      SEM_SEASON_BTNS.forEach(id => { if(id !== btnId) removeSemKC(id); });
    }
    if(SEM_VIEW_BTNS.includes(btnId)){
      SEM_VIEW_BTNS.forEach(id => { if(id !== btnId) removeSemKC(id); });
    }
    const card = document.createElement('div');
    card.className = 'sem-kc-card';
    const imgHtml = data.img ? `<img class="kc-img" src="${data.img}" />` : '';
    card.innerHTML = `<button class="kc-close">&times;</button><div class="kc-title">${data.title}</div><div class="kc-desc">${data.desc}</div>${imgHtml}`;
    card.querySelector('.kc-close').addEventListener('click', () => toggleSemKC(btnId, data));
    semKcStack.appendChild(card);
    activeSemCards.set(btnId, card);
    if(SEM_SEASON_BTNS.includes(btnId)){
      document.getElementById(btnId).classList.add('active');
    }
  }
  semKcStack.classList.toggle('show', activeSemCards.size > 0);
}

function clearAllSemKC(){
  activeSemCards.forEach((card, btnId) => {
    card.remove();
    if(SEM_SEASON_BTNS.includes(btnId)){
      const btn = document.getElementById(btnId);
      if(btn) btn.classList.remove('active');
    }
  });
  activeSemCards.clear();
  semKcStack.classList.remove('show');
}

/* Navigation */
const pauseBtn = document.getElementById('pause-btn');

// 相机飞行到指定经纬度位置
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
// 聚焦查看某个火山位置
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

/* Shared deps object for modules */
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
  forceCompleteSplit: () => { if(split && split.splitActive){ split.toggleSplit(); split.forceComplete(earthMat); } },
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
let boundaryGroup, volcanoGroup, earthquakeGroup, plates, split, volcano, earthquake, interior;

(async function bootstrap(){
  [plates, split, volcano, earthquake, interior] = await Promise.all([
    initPlates(ctx, sharedDeps),
    initSplit(ctx, sharedDeps),
    initVolcanoes(ctx, sharedDeps),
    initEarthquakes(ctx, sharedDeps),
    Promise.resolve(initInterior(ctx, sharedDeps)),
  ]);

  boundaryGroup = plates.boundaryGroup;
  volcanoGroup = volcano.volcanoGroup;
  earthquakeGroup = earthquake.earthquakeGroup;

  /* ══════════ Photos: load approved & wire upload button ══════════ */
  loadApprovedPhotos();
  const photoModal = initUploadModal();
  document.getElementById('upload-trigger').addEventListener('click', (e) => {
    photoModal.openModal(e.target.dataset.volcanoId, e.target.dataset.volcanoName);
  });

  /* ══════════ Initial state: hide boundaries & volcanoes ══════════ */
  boundaryGroup.visible = false;
  volcanoGroup.visible = false;
  earthquakeGroup.visible = false;
  gridGroup.visible = false;

  /* Wire up SEM deps */
  const semToggleDeps = {
    closeAllPanels,
    getInteriorMode: () => interior.interiorMode,
    getMagneticMode: () => magneticMode,
    toggleInterior: () => interior.toggleInterior(),
    toggleMagnetic,
    setActivePanel: (v) => { activePanel = v; },
    earth, boundaryGroup, volcanoGroup: volcano.volcanoGroup,
    earthquakeGroup: earthquake.earthquakeGroup,
    gridGroup, magneticGroup,
    splitParent: split.splitParent,
    setAutoRotate: (v) => { autoRotate = v; },
    setManualPause: (v) => { manualPause = v; },
  };

  /* ══════════ Mode switching ══════════ */
  function enterEarthMode(){
    autoMergeSplit();
    resetEarthState();

    if(currentMode === 'sem'){
      clearAllSemKC();
      if(semMod.semMode) semMod.toggleSEM(semToggleDeps);
      document.getElementById('tb-sem').classList.remove('active');
      earth.visible = true;
      controls.target.set(0,0,0);
      controls.minDistance = 2.0;
      controls.maxDistance = 10;
      camera.position.set(0,0,3);
      camera.lookAt(0,0,0);
      controls.update();
    }

    currentMode = 'earth';
    document.getElementById('tb-earth').classList.add('active');
    document.getElementById('earth-panel').classList.add('show');
  }

  function enterSEMMode(){
    if(currentMode === 'sem'){
      const sp = document.getElementById('sem-panel');
      if(sp.classList.contains('show')){
        sp.classList.remove('show');
        document.getElementById('tb-sem').classList.remove('active');
      } else {
        sp.classList.add('show');
        document.getElementById('tb-sem').classList.add('active');
      }
      return;
    }
    autoMergeSplit();
    resetEarthState();
    document.getElementById('earth-panel').classList.remove('show');
    document.getElementById('tb-earth').classList.remove('active');
    currentMode = 'sem';
    if(magneticMode) toggleMagnetic();
    if(interior.interiorMode) interior.toggleInterior();
    closeAllPanels();
    hideKC();
    semMod.toggleSEM(semToggleDeps);
    document.getElementById('tb-sem').classList.add('active');
  }

  document.getElementById('tb-earth').addEventListener('click', enterEarthMode);
  document.getElementById('tb-sem').addEventListener('click', enterSEMMode);

  /* ══════════ 内容显示 section (simple toggles) ══════════ */
  document.getElementById('ep-terrain').addEventListener('click', () => {
    autoMergeSplit();
    const btn = document.getElementById('ep-terrain');
    const active = btn.classList.toggle('active');
    earthMat.uniforms.uBumpScale.value = active ? 0.018 : 0.0; // 0.018=地形凹凸高度
  });

  document.getElementById('ep-show-plates').addEventListener('click', () => {
    autoMergeSplit();
    const btn = document.getElementById('ep-show-plates');
    const active = btn.classList.toggle('active');
    boundaryGroup.visible = active;
    gridGroup.visible = active;
  });

  document.getElementById('ep-show-volcano').addEventListener('click', () => {
    autoMergeSplit();
    const btn = document.getElementById('ep-show-volcano');
    const active = btn.classList.toggle('active');
    volcanoGroup.visible = active;
  });

  document.getElementById('ep-show-earthquake').addEventListener('click', () => {
    autoMergeSplit();
    const btn = document.getElementById('ep-show-earthquake');
    const active = btn.classList.toggle('active');
    earthquakeGroup.visible = active;
    if (active) earthquake.loadDefault();
  });

  /* ══════════ 地球探索 section (accordion) ══════════ */
  function openExplore(key){
    autoMergeSplit();
    const btn = document.getElementById('ep-' + key);
    const isActive = btn.classList.contains('active');

    if(interior.interiorMode && key !== 'interior') interior.toggleInterior();
    if(magneticMode && key !== 'magnetic') toggleMagnetic();

    closeAllSubs();
    deactivateAllExplore();
    hideKC();

    if(isActive) {
      if(key === 'plates'){ boundaryGroup.visible = false; gridGroup.visible = false; document.getElementById('ep-show-plates').classList.remove('active'); }
      if(key === 'volcano'){ volcanoGroup.visible = false; document.getElementById('ep-show-volcano').classList.remove('active'); }
      if(key === 'earthquake'){ earthquakeGroup.visible = false; document.getElementById('ep-show-earthquake').classList.remove('active'); }
      if(key === 'interior') interior.toggleInterior();
      return;
    }

    btn.classList.add('active');

    if(key === 'plates'){
      document.getElementById('plates-sub').classList.add('show');
      boundaryGroup.visible = true;
      gridGroup.visible = true;
      volcanoGroup.visible = false;
      earthquakeGroup.visible = false;
      document.getElementById('ep-show-plates').classList.add('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
      document.getElementById('ep-show-earthquake').classList.remove('active');
    }
    else if(key === 'volcano'){
      document.getElementById('volcano-sub').classList.add('show');
      volcanoGroup.visible = true;
      earthquakeGroup.visible = false;
      boundaryGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-volcano').classList.add('active');
      document.getElementById('ep-show-plates').classList.remove('active');
      document.getElementById('ep-show-earthquake').classList.remove('active');
    }
    else if(key === 'earthquake'){
      document.getElementById('earthquake-sub').classList.add('show');
      earthquakeGroup.visible = true;
      volcanoGroup.visible = false;
      document.getElementById('ep-show-earthquake').classList.add('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
    }
    else if(key === 'interior'){
      document.getElementById('interior-sub').classList.add('show');
      interior.toggleInterior();
      boundaryGroup.visible = false;
      volcanoGroup.visible = false;
      earthquakeGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-plates').classList.remove('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
      document.getElementById('ep-show-earthquake').classList.remove('active');
    }
    else if(key === 'magnetic'){
      toggleMagnetic();
      boundaryGroup.visible = false;
      volcanoGroup.visible = false;
      earthquakeGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-plates').classList.remove('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
      document.getElementById('ep-show-earthquake').classList.remove('active');
    }
  }

  document.getElementById('ep-plates').addEventListener('click', () => openExplore('plates'));
  document.getElementById('ep-volcano').addEventListener('click', () => openExplore('volcano'));
  document.getElementById('ep-earthquake').addEventListener('click', () => openExplore('earthquake'));
  document.getElementById('ep-interior').addEventListener('click', () => openExplore('interior'));
  document.getElementById('ep-magnetic').addEventListener('click', () => openExplore('magnetic'));

  /* ══════════ SEM science cards ══════════ */
  function getSemScienceData() {
    return {
      'sem-view-orbit': { title: t('kc.sem-orbit.title'), desc: t('kc.sem-orbit.desc') },
      'sem-view-rotate': { title: t('kc.sem-rotate.title'), desc: t('kc.sem-rotate.desc') },
      'sem-spring': { title: t('kc.sem-spring.title'), desc: t('kc.sem-spring.desc') },
      'sem-summer': { title: t('kc.sem-summer.title'), desc: t('kc.sem-summer.desc') },
      'sem-autumn': { title: t('kc.sem-autumn.title'), desc: t('kc.sem-autumn.desc') },
      'sem-winter': { title: t('kc.sem-winter.title'), desc: t('kc.sem-winter.desc') },
    };
  }

  Object.keys(getSemScienceData()).forEach(btnId => {
    const btn = document.getElementById(btnId);
    if(btn) {
      btn.addEventListener('click', () => toggleSemKC(btnId, getSemScienceData()[btnId]));
    }
  });

  /* ══════════ Pause / Reset ══════════ */
  document.getElementById('reset-view-btn').addEventListener('click', () => {
    if(currentMode === 'sem'){
      clearAllSemKC();
      semMod.toggleSEM(semToggleDeps);
      currentMode = 'earth';
      document.getElementById('tb-sem').classList.remove('active');
    }
    autoMergeSplit();
    resetEarthState();
    volcano.deselectVolcano();
    document.getElementById('earth-panel').classList.remove('show');
    document.getElementById('tb-earth').classList.remove('active');
    earth.visible = true;
    earth.rotation.y=0;syncRotY();
    camera.position.set(0,0,3);camera.lookAt(controls.target);
    controls.target.set(0,0,0);
    controls.minDistance = 2.0;
    controls.maxDistance = 10;
    controls.update();navAnim=null;savedView=null;
    autoRotate=true;manualPause=false;pauseBtn.textContent='⏸';
  });
  document.getElementById('reset-pos-btn').addEventListener('click', () => {
    if(currentMode === 'sem') return;
    earth.rotation.y=0;syncRotY();
    camera.position.set(0,0,3);camera.lookAt(controls.target);
    controls.target.set(0,0,0);
    controls.minDistance = 2.0;
    controls.maxDistance = 10;
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
    if(currentMode === 'sem') return;
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

  /* ══════════ Language Toggle ══════════ */
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      setLang(getLang() === 'zh' ? 'en' : 'zh');
      langToggle.textContent = t('lang.toggle');
    });
  }
  updateDOM();

  /* ══════════ Animate ══════════ */
  // 同步所有叠加层的旋转角度与地球一致
  function syncRotY(){
    boundaryGroup.rotation.y = earth.rotation.y;
    volcano.volcanoGroup.rotation.y = earth.rotation.y;
    earthquake.earthquakeGroup.rotation.y = earth.rotation.y;
    gridGroup.rotation.y = earth.rotation.y;
    split.splitParent.rotation.y = earth.rotation.y;
    magneticGroup.rotation.y = earth.rotation.y;
  }

  // 主渲染循环：每帧更新旋转、动画、渲染
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
      if(autoRotate && !interior.interiorMode && currentMode==='earth'){earth.rotation.y+=0.001;syncRotY();} // 0.001=地球自转速度（弧度/帧）
      controls.update();
    }

    split.updateSplit(earthMat, boundaryGroup);
    volcano.updatePulse(t);
    volcano.updatePinned();
    earthquake.updatePulse(t);
    interior.updateTime(t);
    semMod.updateSEM(0.016);
    earthMat.uniforms.uCam.value.copy(camera.position);
    renderer.render(scene, camera);
  })();
})();

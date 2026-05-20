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
let currentMode = 'earth';

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
  document.getElementById('ep-magnetic').classList.toggle('active', magneticMode);
  if(magneticMode){
    if(interior && interior.interiorMode) interior.toggleInterior();
    if(boundaryGroup) boundaryGroup.visible = false;
    if(volcanoGroup) volcanoGroup.visible = false;
    gridGroup.visible = false;
    earthMat.uniforms.uOpacity.value = 0.35;
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
const SUB_IDS = ['plates-sub', 'volcano-sub', 'interior-sub'];
const EXPLORE_BTN_IDS = ['ep-plates', 'ep-volcano', 'ep-interior', 'ep-magnetic'];

function closeAllSubs(){
  SUB_IDS.forEach(id => document.getElementById(id).classList.remove('show'));
}

function deactivateAllExplore(){
  EXPLORE_BTN_IDS.forEach(id => document.getElementById(id).classList.remove('active'));
}

function resetEarthState(){
  closeAllSubs();
  deactivateAllExplore();
  hideKC();
  if(interior && interior.interiorMode) interior.toggleInterior();
  if(magneticMode) toggleMagnetic();
  if(boundaryGroup) boundaryGroup.visible = false;
  if(volcanoGroup) volcanoGroup.visible = false;
  gridGroup.visible = false;
  earthMat.uniforms.uBumpScale.value = 0.0;
  document.getElementById('ep-terrain').classList.remove('active');
  document.getElementById('ep-show-plates').classList.remove('active');
  document.getElementById('ep-show-volcano').classList.remove('active');
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

  /* ══════════ Initial state: hide boundaries & volcanoes ══════════ */
  boundaryGroup.visible = false;
  volcanoGroup.visible = false;
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
    earthMat.uniforms.uBumpScale.value = active ? 0.018 : 0.0;
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
      if(key === 'plates'){ boundaryGroup.visible = false; gridGroup.visible = false; }
      if(key === 'volcano') volcanoGroup.visible = false;
      if(key === 'interior') interior.toggleInterior();
      return;
    }

    btn.classList.add('active');

    if(key === 'plates'){
      document.getElementById('plates-sub').classList.add('show');
      boundaryGroup.visible = true;
      gridGroup.visible = true;
      volcanoGroup.visible = false;
      document.getElementById('ep-show-plates').classList.add('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
    }
    else if(key === 'volcano'){
      document.getElementById('volcano-sub').classList.add('show');
      volcanoGroup.visible = true;
      boundaryGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-volcano').classList.add('active');
      document.getElementById('ep-show-plates').classList.remove('active');
    }
    else if(key === 'interior'){
      document.getElementById('interior-sub').classList.add('show');
      interior.toggleInterior();
      boundaryGroup.visible = false;
      volcanoGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-plates').classList.remove('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
    }
    else if(key === 'magnetic'){
      toggleMagnetic();
      boundaryGroup.visible = false;
      volcanoGroup.visible = false;
      gridGroup.visible = false;
      document.getElementById('ep-show-plates').classList.remove('active');
      document.getElementById('ep-show-volcano').classList.remove('active');
    }
  }

  document.getElementById('ep-plates').addEventListener('click', () => openExplore('plates'));
  document.getElementById('ep-volcano').addEventListener('click', () => openExplore('volcano'));
  document.getElementById('ep-interior').addEventListener('click', () => openExplore('interior'));
  document.getElementById('ep-magnetic').addEventListener('click', () => openExplore('magnetic'));

  /* ══════════ SEM science cards ══════════ */
  const semScienceData = {
    'sem-view-orbit': {
      title: '地球公转',
      desc: '<p>地球沿近似圆形的椭圆轨道绕太阳运行，轨道半长轴约 1.496 亿千米（1 AU）。</p><p class="kc-subtitle">基本参数</p><ul><li>公转周期：365.25 天（1 恒星年）</li><li>轨道偏心率：0.0167（近似正圆）</li><li>公转速度：约 29.8 km/s</li><li>轨道倾角：与黄道面重合（定义为 0°）</li></ul><p class="kc-subtitle">季节成因</p><ul><li>地轴倾斜 23.4° 是四季形成的根本原因</li><li>公转使太阳直射点在南北回归线间移动</li></ul>'
    },
    'sem-view-rotate': {
      title: '地球自转',
      desc: '<p>地球绕自身轴线旋转，自转轴与公转轨道面（黄道面）成 66.6° 夹角，即地轴倾斜 23.4°。</p><p class="kc-subtitle">基本参数</p><ul><li>自转周期：23 小时 56 分 4 秒（1 恒星日）</li><li>太阳日：24 小时</li><li>赤道线速度：约 465 m/s</li><li>自转方向：自西向东（从北极上方看逆时针）</li></ul><p class="kc-subtitle">效应</p><ul><li>昼夜交替：地球自转产生白天和黑夜的循环</li><li>科里奥利力：影响大气和海洋环流方向</li></ul>'
    },
    'sem-spring': {
      title: '北分点（春分）',
      desc: '<p>太阳直射赤道，全球昼夜几乎等长。</p><p class="kc-subtitle">特点</p><ul><li>日期：约 3 月 20-21 日</li><li>太阳直射点：赤道（0°）</li><li>北半球：春季开始，白昼逐渐变长</li><li>南半球：秋季开始，白昼逐渐变短</li></ul>'
    },
    'sem-summer': {
      title: '北至点（夏至）',
      desc: '<p>太阳直射北回归线，北半球白昼最长。</p><p class="kc-subtitle">特点</p><ul><li>日期：约 6 月 21-22 日</li><li>太阳直射点：北回归线（23.4°N）</li><li>北半球：白昼最长，夏季正式开始</li><li>南半球：白昼最短，冬季正式开始</li><li>北极圈内：极昼现象</li><li>南极圈内：极夜现象</li></ul>'
    },
    'sem-autumn': {
      title: '南分点（秋分）',
      desc: '<p>太阳再次直射赤道，全球昼夜几乎等长。</p><p class="kc-subtitle">特点</p><ul><li>日期：约 9 月 22-23 日</li><li>太阳直射点：赤道（0°）</li><li>北半球：秋季开始，白昼逐渐变短</li><li>南半球：春季开始，白昼逐渐变长</li></ul>'
    },
    'sem-winter': {
      title: '南至点（冬至）',
      desc: '<p>太阳直射南回归线，北半球白昼最短。</p><p class="kc-subtitle">特点</p><ul><li>日期：约 12 月 21-22 日</li><li>太阳直射点：南回归线（23.4°S）</li><li>北半球：白昼最短，冬季正式开始</li><li>南半球：白昼最长，夏季正式开始</li><li>北极圈内：极夜现象</li><li>南极圈内：极昼现象</li></ul>'
    }
  };

  Object.entries(semScienceData).forEach(([btnId, data]) => {
    const btn = document.getElementById(btnId);
    if(btn) {
      btn.addEventListener('click', () => toggleSemKC(btnId, data));
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
      if(autoRotate && !interior.interiorMode && currentMode==='earth'){earth.rotation.y+=0.001;syncRotY();}
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

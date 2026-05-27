import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { t } from '../../i18n/lang.js';

const BOUNDARY_R = 1.003; // 边界线离地球表面的高度（1=贴地表，越大越高）
// 边界类型颜色：c=汇聚(红)、d=离散(绿)、t=转换(黄)、u=未分类(灰)
const BCOLORS = {c:{main:0xff4444,glow:0xff4444},d:{main:0x44ff88,glow:0x44ff88},t:{main:0xffcc33,glow:0xffcc33},u:{main:0x888888,glow:0x888888}};
function getTypeLabel(bt) { const map={c:'b.convergent',d:'b.divergent',t:'b.transform',u:'b.unclassified'}; return t(map[bt]||'b.unclassified'); }
function getPlateName(code) { return t('pn.'+code) || code; }

const PLATES = [
  {nameKey:'plate.EU',lng:60,lat:50,codes:['EU','SU','BU','AM','YA','ON','OK','AT','AS','BS','MS']},
  {nameKey:'plate.AF',lng:20,lat:5,codes:['AF','SO']},
  {nameKey:'plate.AR',lng:45,lat:25,codes:['AR']},
  {nameKey:'plate.IN',lng:85,lat:-10,codes:['IN','AU']},
  {nameKey:'plate.PA',lng:-170,lat:0,codes:['PA']},
  {nameKey:'plate.PS',lng:130,lat:15,codes:['PS']},
  {nameKey:'plate.JF',lng:-128,lat:45,codes:['JF']},
  {nameKey:'plate.CO',lng:-100,lat:10,codes:['CO']},
  {nameKey:'plate.NZ',lng:-82,lat:-15,codes:['NZ']},
  {nameKey:'plate.SA',lng:-55,lat:-15,codes:['SA']},
  {nameKey:'plate.NA',lng:-100,lat:45,codes:['NA']},
  {nameKey:'plate.CA',lng:-75,lat:15,codes:['CA']},
  {nameKey:'plate.AN',lng:0,lat:-80,codes:['AN']},
  {nameKey:'plate.SC',lng:-45,lat:-58,codes:['SC']},
];

function getKcBoundary(key) {
  return { title: t('kc.'+key+'.title'), desc: t('kc.'+key+'.desc'), img: 'earth_function/plates/textures/' + ({c:'汇聚型板块边界',d:'离散型板块边界',t:'转换断层'})[key.split('-')[1]] + '.jpg' };
}

export async function init({ scene, TILT, resolution, allLineMats, lngLatToVec3 }, deps) {
  const boundaryGroup = new THREE.Group();
  boundaryGroup.rotation.x = TILT;
  scene.add(boundaryGroup);
  const bPairs = [];

  const PB = await fetch('earth_function/plates/pb-data.json').then(r => r.json());

  function parsePlate(code){ return code.replace(/[\\\/]/g,'-').split('-').map(p=>getPlateName(p)).join(' — '); }

  PB.forEach(([btype,plate,coords]) => {
    if(coords.length < 2) return;
    const col = BCOLORS[btype] || BCOLORS.u;
    const positions = [];
    coords.forEach(([lng,lat]) => { const v=lngLatToVec3(lng,lat,BOUNDARY_R); positions.push(v.x,v.y,v.z); });

    const gGeo=new LineGeometry();gGeo.setPositions(positions);
    const gMat=new LineMaterial({color:col.glow,linewidth:4,transparent:true,opacity:0.18,resolution,depthWrite:false}); // 发光线：linewidth=粗细, opacity=透明度
    const gLine=new Line2(gGeo,gMat);gLine.computeLineDistances();
    boundaryGroup.add(gLine);allLineMats.push(gMat);

    const mGeo=new LineGeometry();mGeo.setPositions(positions);
    const mMat=new LineMaterial({color:col.main,linewidth:1.8,transparent:true,opacity:0.9,resolution}); // 主线：linewidth=粗细, opacity=透明度
    const mLine=new Line2(mGeo,mMat);mLine.computeLineDistances();
    const plateParts=plate.replace(/[\\\/]/g,'-').split('-');
    mLine.userData={plate,btype,plateParts,get label(){ return parsePlate(plate)+' · '+getTypeLabel(btype); }};
    boundaryGroup.add(mLine);allLineMats.push(mMat);

    bPairs.push({main:mLine,glow:gLine,btype,plate,plateParts,origColor:col.main});
  });

  /* Boundary Filter */
  const bGrid = document.getElementById('boundary-grid');
  let highlightBtype = null;

  function resetBoundaryColors(){
    deps.hideKC();
    bPairs.forEach(p => {
      p.main.material.color.setHex(p.origColor);p.main.material.linewidth=1.8;p.main.material.opacity=0.9; // 主线默认粗细和透明度
      p.glow.material.color.setHex(p.origColor);p.glow.material.linewidth=4;p.glow.material.opacity=0.18; // 发光线默认粗细和透明度
    });
  }

  [{t:'c',c:'#ff4444',lk:'b.convergentChip'},{t:'d',c:'#44ff88',lk:'b.divergentChip'},{t:'t',c:'#ffcc33',lk:'b.transformChip'}].forEach(o => {
    const btn=document.createElement('div');btn.className='chip';btn.dataset.btype=o.t;
    btn.innerHTML=`<span class="cline" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${t(o.lk)}`;
    btn.addEventListener('click',e => {
      e.stopPropagation();
      if(deps.getSplitActive()) deps.forceCompleteSplit();
      clearPlateHighlight();
      if(highlightBtype===o.t){
        highlightBtype=null;bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));resetBoundaryColors();
        deps.hideKC();
        return;
      }
      highlightBtype=o.t;
      bGrid.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.btype===o.t));
      bPairs.forEach(p => {
        if(p.btype===o.t){p.main.material.linewidth=2.8;p.main.material.opacity=1;p.glow.material.linewidth=7;p.glow.material.opacity=0.35;} // 选中边界类型的高亮粗细
        else{p.main.material.opacity=0.1;p.glow.material.opacity=0.02;} // 非选中边界的淡化透明度
      });
      boundaryGroup.visible = true;
      deps.showKC(getKcBoundary('boundary-'+o.t));
    });
    bGrid.appendChild(btn);
  });

  /* Plate Navigation */
  const pGrid = document.getElementById('plate-grid');
  let highlightPlate = null;

  function clearPlateHighlight(){
    highlightPlate=null;pGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));resetBoundaryColors();
  }

  PLATES.forEach(pl => {
    const btn=document.createElement('button');btn.className='chip';btn.textContent=t(pl.nameKey);
    btn.addEventListener('click',e => {
      e.stopPropagation();
      if(deps.getSplitActive()) deps.forceCompleteSplit();
      highlightBtype=null;bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      if(highlightPlate===pl.nameKey){clearPlateHighlight();return;}
      highlightPlate=pl.nameKey;
      pGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      bPairs.forEach(p => {
        if(p.plateParts.some(c=>pl.codes.includes(c))){
          p.main.material.color.set(0x44ff88);p.main.material.linewidth=3.5;p.main.material.opacity=1; // 选中板块边界高亮颜色(绿)和粗细
          p.glow.material.color.set(0x44ff88);p.glow.material.linewidth=8;p.glow.material.opacity=0.35; // 选中板块边界发光线
        } else {p.main.material.opacity=0.1;p.glow.material.opacity=0.02;} // 非选中板块的淡化透明度
      });
      boundaryGroup.visible = true;
      deps.navigateTo(pl.lng,pl.lat,null);
    });
    pGrid.appendChild(btn);
  });

  const splitBtn=document.createElement('button');splitBtn.id='split-btn';splitBtn.textContent=t('p.splitPlates');
  splitBtn.addEventListener('click',e=>{e.stopPropagation();deps.toggleSplit();});
  document.getElementById('split-section').appendChild(splitBtn);

  return {
    boundaryGroup,
    bPairs,
    splitBtn,
    clearPlateHighlight,
    resetBoundaryColors,
    get highlightBtype(){ return highlightBtype; },
    set highlightBtype(v){ highlightBtype = v; },
    bGrid,
  };
}

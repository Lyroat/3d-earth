import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const BOUNDARY_R = 1.003; // 边界线离地球表面的高度（1=贴地表，越大越高）
// 边界类型颜色：c=汇聚(红)、d=离散(绿)、t=转换(黄)、u=未分类(灰)
const BCOLORS = {c:{main:0xff4444,glow:0xff4444},d:{main:0x44ff88,glow:0x44ff88},t:{main:0xffcc33,glow:0xffcc33},u:{main:0x888888,glow:0x888888}};
const TYPE_LABELS = {c:'汇聚边界',d:'离散边界',t:'转换断层',u:'未分类'};
const PLATE_NAMES = {AF:'非洲',AN:'南极洲',AP:'阿尔蒂普拉诺',AR:'阿拉伯',AS:'爱琴海',AT:'阿纳托利亚',AU:'澳大利亚',BH:'伯兹黑德',BR:'鸟头',BS:'班达海',BU:'缅甸',CA:'加勒比',CL:'卡罗琳',CO:'科科斯',CR:'哥斯达黎加',EA:'复活节岛',EU:'欧亚',FT:'汤加前弧',GP:'加拉帕戈斯',IN:'印度',JF:'胡安·德富卡',JZ:'胡安·费尔南德斯',KE:'克马德克',MA:'马里亚纳',MN:'马努斯',MO:'摩鹿加海',MS:'马库斯岛',NA:'北美',NB:'努比亚',ND:'北安第斯',NH:'新赫布里底',NI:'纽亚福阿',NZ:'纳兹卡',OK:'鄂霍茨克',ON:'冲绳',PA:'太平洋',PM:'巴拿马',PS:'菲律宾海',RI:'里维拉',SA:'南美',SB:'所罗门海',SC:'斯科舍',SL:'设得兰',SO:'索马里',SS:'南桑威奇',SU:'巽他',SW:'三明治',TI:'帝汶',TO:'汤加',WL:'伍德拉克',YA:'扬马延'};

const PLATES = [
  {name:'欧亚',lng:60,lat:50,codes:['EU','SU','BU','AM','YA','ON','OK','AT','AS','BS','MS']},
  {name:'非洲',lng:20,lat:5,codes:['AF','SO']},
  {name:'阿拉伯',lng:45,lat:25,codes:['AR']},
  {name:'印度',lng:85,lat:-10,codes:['IN','AU']},
  {name:'太平洋',lng:-170,lat:0,codes:['PA']},
  {name:'菲律宾',lng:130,lat:15,codes:['PS']},
  {name:'胡安德富卡',lng:-128,lat:45,codes:['JF']},
  {name:'科克斯',lng:-100,lat:10,codes:['CO']},
  {name:'纳兹卡',lng:-82,lat:-15,codes:['NZ']},
  {name:'南美',lng:-55,lat:-15,codes:['SA']},
  {name:'北美',lng:-100,lat:45,codes:['NA']},
  {name:'加勒比',lng:-75,lat:15,codes:['CA']},
  {name:'南极洲',lng:0,lat:-80,codes:['AN']},
  {name:'斯科舍',lng:-45,lat:-58,codes:['SC']},
];

const KC_DATA_BOUNDARY = {
  'boundary-c':{title:'汇聚型板块边界',img:'plates/textures/汇聚型板块边界.jpg',desc:'<p>两个板块相向运动，其中一个板块的前端在另一个板块下方滑动并向下弯曲。</p>'},
  'boundary-d':{title:'离散型板块边界',img:'plates/textures/离散型板块边界.jpg',desc:'<p>两个板块相反运动，地幔热物质上涌并部分熔融，从而生成新洋底。</p>'},
  'boundary-t':{title:'转换断层',img:'plates/textures/转换断层.jpg',desc:'<p>两个板块彼此交错滑动，不会发生岩石圈的增减。</p>'},
};

export async function init({ scene, TILT, resolution, allLineMats, lngLatToVec3 }, deps) {
  const boundaryGroup = new THREE.Group();
  boundaryGroup.rotation.x = TILT;
  scene.add(boundaryGroup);
  const bPairs = [];

  const PB = await fetch('plates/pb-data.json').then(r => r.json());

  function parsePlate(code){ return code.replace(/[\\\/]/g,'-').split('-').map(p=>PLATE_NAMES[p]||p).join(' — '); }

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
    mLine.userData={plate,btype,plateParts,label:parsePlate(plate)+' · '+TYPE_LABELS[btype]};
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

  [{t:'c',c:'#ff4444',l:'汇聚型<br>板块边界'},{t:'d',c:'#44ff88',l:'离散型<br>板块边界'},{t:'t',c:'#ffcc33',l:'转换断层'}].forEach(o => {
    const btn=document.createElement('div');btn.className='chip';btn.dataset.btype=o.t;
    btn.innerHTML=`<span class="cline" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${o.l}`;
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
      const kc=KC_DATA_BOUNDARY['boundary-'+o.t];
      if(kc) deps.showKC(kc);
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
    const btn=document.createElement('button');btn.className='chip';btn.textContent=pl.name;
    btn.addEventListener('click',e => {
      e.stopPropagation();
      if(deps.getSplitActive()) deps.forceCompleteSplit();
      highlightBtype=null;bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      if(highlightPlate===pl.name){clearPlateHighlight();return;}
      highlightPlate=pl.name;
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

  const splitBtn=document.createElement('button');splitBtn.id='split-btn';splitBtn.textContent='🔄 拆分板块';
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

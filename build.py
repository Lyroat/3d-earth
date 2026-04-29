#!/usr/bin/env python3
"""Build index.html - 3D Earth v3: sci-fi style, bottom panel, plate split."""
import json, os, math

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ── 1. Bump texture (earth textures loaded dynamically per month) ──
with open('bump-b64.txt', 'r') as f:
    bump_b64 = f.read().strip()
# ── 2. Plate boundaries (PB2002 steps) ──
with open('tectonicplates-master/GeoJSON/PB2002_steps.json') as f:
    steps_data = json.load(f)

TYPE_MAP = {"SUB":"c","CCB":"c","OCB":"c","OSR":"d","CRB":"d","OTF":"t","CTF":"t"}
groups = []
cur_type = cur_plate = None
cur_coords = []
for feat in steps_data['features']:
    props = feat['properties']
    bt = TYPE_MAP.get(props.get('STEPCLASS',''), 'u')
    plate = props.get('PLATEBOUND','')
    cont = props.get('BOUNDCONT','FALSE') == 'TRUE'
    coords = feat['geometry']['coordinates']
    start = [round(coords[0][0],2), round(coords[0][1],2)]
    end = [round(coords[-1][0],2), round(coords[-1][1],2)]
    if cont and bt == cur_type and plate == cur_plate:
        cur_coords.append(end)
    else:
        if cur_coords: groups.append([cur_type, cur_plate, cur_coords])
        cur_type, cur_plate, cur_coords = bt, plate, [start, end]
if cur_coords: groups.append([cur_type, cur_plate, cur_coords])
plate_data_json = json.dumps(groups, separators=(',',':'))

# ── 3. Volcano data ──
STATUS_MAP = {"活火山":"a","休眠火山":"d","死火山":"e"}
with open('world_volcanoes.json','r',encoding='utf-8') as f:
    raw_v = json.load(f)
volcanoes = []
for v in raw_v:
    sc = STATUS_MAP.get(v.get('status',''),'u')
    volcanoes.append([
        round(v['lon'],2), round(v['lat'],2),
        v['name'], v.get('name_cn','') or v['name'],
        v.get('type',''), v.get('type_cn','') or v.get('type',''),
        sc, v.get('status',''), v.get('status_en',''),
        v.get('region',''), v.get('last_eruption',''), v.get('last_eruption_cn','')
    ])
volcanoes_json = json.dumps(volcanoes, ensure_ascii=False, separators=(',',':'))

# ── 4. Plate polygon data for split feature ──
with open('tectonicplates-master/GeoJSON/PB2002_plates.json') as f:
    plates_geo = json.load(f)

PLATE_DEF = {
    '欧亚':{'codes':['EU'],'cx':60,'cy':50},
    '非洲':{'codes':['AF','SO'],'pcodes':['AF'],'cx':20,'cy':5},
    '阿拉伯':{'codes':['AR'],'cx':45,'cy':25},
    '印度':{'codes':['IN','AU'],'pcodes':['IN'],'cx':85,'cy':-10},
    '太平洋':{'codes':['PA'],'cx':-170,'cy':0},
    '菲律宾':{'codes':['PS'],'cx':130,'cy':15},
    '胡安德富卡':{'codes':['JF'],'cx':-128,'cy':45},
    '科克斯':{'codes':['CO'],'cx':-100,'cy':10},
    '纳兹卡':{'codes':['NZ'],'cx':-82,'cy':-15},
    '南美':{'codes':['SA'],'cx':-55,'cy':-15},
    '北美':{'codes':['NA'],'cx':-100,'cy':45},
    '加勒比':{'codes':['CA'],'cx':-75,'cy':15},
    '南极洲':{'codes':['AN'],'cx':0,'cy':-80},
    '斯科舍':{'codes':['SC'],'cx':-45,'cy':-58},
}
SPLIT_COLORS = ['#4fc3f7','#e57373','#FFD54F','#81c784','#ba68c8',
                '#4dd0e1','#ff8a65','#aed581','#f06292','#90a4ae',
                '#7986cb','#fff176','#a1887f','#80cbc4']

plate_polygons = {}
plate_polygons_full = {}
for feat in plates_geo['features']:
    code = feat['properties'].get('Code','')
    coords = feat['geometry']['coordinates']
    if feat['geometry']['type'] == 'Polygon':
        rings3 = [[[round(c[0],1),round(c[1],1)] for c in coords[0][::3]]]
        rings1 = [[[round(c[0],2),round(c[1],2)] for c in coords[0]]]
    else:
        rings3, rings1 = [], []
        for poly in coords:
            r3 = [[round(c[0],1),round(c[1],1)] for c in poly[0][::3]]
            r1 = [[round(c[0],2),round(c[1],2)] for c in poly[0]]
            if len(r3) >= 3:
                rings3.append(r3)
            if len(r1) >= 3:
                rings1.append(r1)
    if code not in plate_polygons:
        plate_polygons[code] = rings3
        plate_polygons_full[code] = rings1
    else:
        plate_polygons[code].extend(rings3)
        plate_polygons_full[code].extend(rings1)

def split_dateline(ring, threshold=0.1):
    segs, cur = [], []
    for i, (lo, la) in enumerate(ring):
        if i > 0 and abs(abs(lo)-180) < threshold and abs(abs(ring[i-1][0])-180) < threshold:
            if len(cur) >= 2: segs.append(cur)
            cur = [[lo, la]]
        else:
            cur.append([lo, la])
    if len(cur) >= 2: segs.append(cur)
    return segs

split_data = {}
for i,(name,info) in enumerate(PLATE_DEF.items()):
    poly_codes = info.get('pcodes', info['codes'])
    outline_segs = []
    for code in poly_codes:
        if code in plate_polygons_full:
            for ring in plate_polygons_full[code]:
                segs = split_dateline(ring)
                outline_segs.extend(segs)
    bdry_idx = []
    for j,(btype,plate_code,coords) in enumerate(groups):
        parts = plate_code.replace('\\','-').replace('/','-').split('-')
        if any(p in info['codes'] for p in parts):
            bdry_idx.append(j)
    split_data[name] = {
        'codes': info['codes'],
        'cx': info['cx'], 'cy': info['cy'],
        'color': SPLIT_COLORS[i],
        'idx': bdry_idx,
        'polys': outline_segs
    }
split_json = json.dumps(split_data, ensure_ascii=False, separators=(',',':'))

print(f"Boundaries: {len(groups)} segments, {len(plate_data_json)//1024}KB")
print(f"Volcanoes: {len(volcanoes)}, {len(volcanoes_json)//1024}KB")
print(f"Split data: {len(split_json)//1024}KB")

# ── 5. Build HTML ──
template = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>三维地球 — 板块构造与火山</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;color:#fff}
canvas{display:block}

#loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#000;z-index:100;transition:opacity .8s}
#loading.hidden{opacity:0;pointer-events:none}
.spinner{width:48px;height:48px;border:3px solid rgba(255,255,255,.15);border-top-color:#4fc3f7;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Bottom Toolbar ── */
#bottom-bar{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:4px;padding:10px 16px;background:linear-gradient(to top,rgba(0,0,0,.82),rgba(0,0,0,.3) 80%,transparent);z-index:10;pointer-events:none}
.tb-btn{pointer-events:auto;padding:6px 14px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font-size:12px;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:5px;white-space:nowrap;position:relative}
.tb-btn:hover{background:rgba(255,255,255,.14);color:#fff}
.tb-btn.active{background:rgba(77,195,247,.18);border-color:rgba(77,195,247,.4);color:#fff}
#pause-btn{pointer-events:auto;width:32px;height:32px;border:none;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}
#pause-btn:hover{background:rgba(255,255,255,.22)}
.hint{pointer-events:none;font-size:10px;color:rgba(255,255,255,.35);white-space:nowrap;margin-left:6px}

/* ── Popup Menu ── */
.popup-menu{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(8,8,18,.92);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;display:none;z-index:20;min-width:180px;max-height:420px;overflow-y:auto}
.popup-menu.show{display:block}
.pm-title{font-size:10px;color:rgba(255,255,255,.35);padding:4px 8px 6px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:4px}
.pm-grid{display:flex;flex-wrap:wrap;gap:4px;padding:4px}
.pm-search{position:relative;padding:4px 8px 8px}

.chip{padding:4px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);font-size:11px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:5px;white-space:nowrap;font-family:inherit;line-height:1.4}
.chip:hover{background:rgba(255,255,255,.12);color:#fff}
.chip.off{opacity:.3}
.chip.active{background:rgba(77,195,247,.2);border-color:rgba(77,195,247,.45);color:#fff}
.chip .cdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.chip .cline{width:20px;height:3px;border-radius:2px;flex-shrink:0}
.chip small{color:rgba(255,255,255,.35);font-size:10px}

#split-btn{padding:4px 12px;border:1px solid rgba(100,200,255,.25);border-radius:6px;background:rgba(100,200,255,.08);color:rgba(100,200,255,.85);font-size:11px;cursor:pointer;font-family:inherit;transition:all .15s}
#split-btn:hover{background:rgba(100,200,255,.18);color:#fff}
#split-btn.active{background:rgba(100,200,255,.25);border-color:rgba(100,200,255,.5);color:#fff}

/* ── Search ── */
#volcano-search{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;font-size:11px;padding:5px 10px;width:100%;outline:none;font-family:inherit;box-sizing:border-box}
#volcano-search:focus{border-color:rgba(77,195,247,.5);background:rgba(255,255,255,.12)}
#volcano-search::placeholder{color:rgba(255,255,255,.3)}
#search-results{position:absolute;bottom:calc(100% + 4px);left:0;right:0;width:100%;max-height:220px;overflow-y:auto;background:rgba(8,8,18,.95);backdrop-filter:blur(14px);border-radius:10px;border:1px solid rgba(255,255,255,.12);display:none;z-index:55;padding:4px 0}
.sr-item{padding:6px 12px;cursor:pointer;font-size:11px;color:rgba(255,255,255,.8);border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;align-items:center}
.sr-item:hover{background:rgba(77,195,247,.15);color:#fff}
.sr-item:last-child{border-bottom:none}
.sr-name{font-weight:500}.sr-sub{color:rgba(255,255,255,.4);font-size:10px}

/* ── Tooltip ── */
#tooltip{position:absolute;display:none;background:rgba(8,8,18,.88);backdrop-filter:blur(14px);padding:12px 16px;border-radius:12px;font-size:12px;color:rgba(255,255,255,.92);pointer-events:none;white-space:nowrap;border:1px solid rgba(255,255,255,.1);z-index:30;line-height:1.7}
.tip-name-cn{font-size:14px;font-weight:600;margin-bottom:1px}
.tip-name-en{color:rgba(255,255,255,.45);font-size:11px;margin-bottom:5px}
.tip-sep{height:1px;background:rgba(255,255,255,.08);margin:5px 0}
.tip-row{display:flex;gap:6px}
.tip-label{color:rgba(255,255,255,.4);min-width:28px}
.tip-val{color:rgba(255,255,255,.85)}
.tip-en{color:rgba(255,255,255,.4);font-size:11px}

/* ── Cluster Popup ── */
#cluster-popup{position:absolute;display:none;background:rgba(8,8,18,.92);backdrop-filter:blur(16px);padding:12px;border-radius:12px;font-size:12px;color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.12);z-index:35;max-height:400px;overflow-y:auto;min-width:210px}
.cl-title{font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)}
.cl-item{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background .12s}
.cl-item:hover{background:rgba(255,255,255,.1)}
.cl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px}
.cl-name{font-weight:500;font-size:12px}
.cl-name small{font-weight:400;color:rgba(255,255,255,.4);font-size:10px;margin-left:3px}
.cl-sub{font-size:10px;color:rgba(255,255,255,.4);margin-top:1px}
#cl-detail{margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);line-height:1.7;font-size:11px}

</style>
</head>
<body>
<div id="loading"><div class="spinner"></div></div>

<div id="bottom-bar">
  <button id="pause-btn" title="暂停/继续">⏸</button>

  <div class="tb-btn" id="tb-plates">板块导航
    <div class="popup-menu" id="menu-plates">
      <div class="pm-title">选择板块（点击旋转到对应位置并高亮）</div>
      <div class="pm-grid" id="plate-grid"></div>
    </div>
  </div>

  <div class="tb-btn" id="tb-boundary">板块边界
    <div class="popup-menu" id="menu-boundary">
      <div class="pm-title">高亮展示对应类型边界</div>
      <div class="pm-grid" id="boundary-grid"></div>
    </div>
  </div>

  <div class="tb-btn" id="tb-volcano">火山筛选
    <div class="popup-menu" id="menu-volcano">
      <div class="pm-title">只显示选定类型的火山</div>
      <div class="pm-grid" id="volcano-grid"></div>
      <div class="pm-search">
        <input type="text" id="volcano-search" placeholder="搜索火山名称，回车定位..." autocomplete="off" />
        <div id="search-results"></div>
      </div>
    </div>
  </div>

  <div class="tb-btn" id="tb-display">显示设置
    <div class="popup-menu" id="menu-display">
      <div class="pm-grid" id="display-grid"></div>
    </div>
  </div>

  <span class="hint">拖动旋转 · 滚轮缩放 · 双击放大 · ESC 返回</span>
</div>

<div id="month-label" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.6);font-size:13px;letter-spacing:2px;pointer-events:none;z-index:5;text-transform:uppercase"></div>
<div id="tooltip"></div>
<div id="cluster-popup"></div>

<img id="bump-tex" style="display:none" src="data:image/jpeg;base64,__BUMP_B64__" />

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

/* ══════════ Constants ══════════ */
const TILT = THREE.MathUtils.degToRad(23.4);
const BOUNDARY_R = 1.003;
const VOLCANO_R = 1.025;
const CLUSTER_PX = 28;
const BCOLORS = {c:{main:0xff4444,glow:0xff4444},d:{main:0x44ff88,glow:0x44ff88},t:{main:0xffcc33,glow:0xffcc33},u:{main:0x888888,glow:0x888888}};
const VCOLORS = {a:'#DC143C',d:'#FFA500',e:'#B0C4DE',u:'#555555'};
const STATUS_CN = {a:'活火山',d:'休眠火山',e:'死火山',u:'未知'};
const STATUS_EN = {a:'Active Volcano',d:'Dormant Volcano',e:'Extinct Volcano',u:'Unknown'};
const TYPE_LABELS = {c:'聚合边界',d:'分离边界',t:'转换断层',u:'未分类'};
const PLATE_NAMES = {AF:'非洲',AN:'南极洲',AP:'阿尔蒂普拉诺',AR:'阿拉伯',AS:'爱琴海',AT:'阿纳托利亚',AU:'澳大利亚',BH:'伯兹黑德',BR:'鸟头',BS:'班达海',BU:'缅甸',CA:'加勒比',CL:'卡罗琳',CO:'科科斯',CR:'哥斯达黎加',EA:'复活节岛',EU:'欧亚',FT:'汤加前弧',GP:'加拉帕戈斯',IN:'印度',JF:'胡安·德富卡',JZ:'胡安·费尔南德斯',KE:'克马德克',MA:'马里亚纳',MN:'马努斯',MO:'摩鹿加海',MS:'马库斯岛',NA:'北美',NB:'努比亚',ND:'北安第斯',NH:'新赫布里底',NI:'纽亚福阿',NZ:'纳兹卡',OK:'鄂霍茨克',ON:'冲绳',PA:'太平洋',PM:'巴拿马',PS:'菲律宾海',RI:'里维拉',SA:'南美',SB:'所罗门海',SC:'斯科舍',SL:'设得兰',SO:'索马里',SS:'南桑威奇',SU:'巽他',SW:'三明治',TI:'帝汶',TO:'汤加',WL:'伍德拉克',YA:'扬马延'};

const PLATES = [
  {name:'欧亚',lng:60,lat:50,codes:['EU']},
  {name:'非洲',lng:20,lat:5,codes:['AF','NB','SO']},
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

/* ══════════ Scene ══════════ */
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

/* ══════════ Earth (sci-fi shader) ══════════ */
const _bk=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);_bk.needsUpdate=true;
const earthGeo = new THREE.SphereGeometry(1, 192, 192);
const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    uTex:{value:_bk}, uBumpTex:{value:_bk},
    uCam:{value:camera.position}, uOpacity:{value:1.0},
    uBumpScale:{value:0.0}
  },
  vertexShader: `
    uniform sampler2D uBumpTex; uniform float uBumpScale;
    varying vec2 vUv; varying vec3 vNorm; varying vec3 vWPos;
    void main(){
      vUv = uv;
      float bump = texture2D(uBumpTex, uv).r;
      vec3 pos = position + normal * bump * uBumpScale;
      vNorm = normalize(normalMatrix * normal);
      vWPos = (modelMatrix * vec4(pos,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
    }`,
  fragmentShader: `
    uniform sampler2D uTex;
    uniform vec3 uCam; uniform float uOpacity;
    varying vec2 vUv; varying vec3 vNorm; varying vec3 vWPos;
    void main(){
      vec3 c = texture2D(uTex, vUv).rgb;
      float gridU = abs(fract(vUv.x * 36.0) - 0.5) * 2.0;
      float gridV = abs(fract(vUv.y * 18.0) - 0.5) * 2.0;
      float grid = max(smoothstep(0.965,1.0,gridU), smoothstep(0.965,1.0,gridV));
      c += grid * vec3(0.015, 0.045, 0.09);
      gl_FragColor = vec4(c, uOpacity);
    }`,
  transparent: true
});
const earth = new THREE.Mesh(earthGeo, earthMat);
earth.rotation.x = TILT;
scene.add(earth);

/* ══════════ Load Textures ══════════ */
let showBump=false;
function mkTex(id){
  const img=document.getElementById(id);
  const t=new THREE.Texture(img);t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.needsUpdate=true;return t;
}
const MONTH_NAMES=['','january','february','march','april','may','june',
  'july','august','september','october','november','december'];
const curMonth=new Date().getMonth()+1;
const texLoader=new THREE.TextureLoader();

function loadBumpTex(){
  const bumpImg=document.getElementById('bump-tex');
  if(!bumpImg.complete||bumpImg.naturalWidth===0){setTimeout(loadBumpTex,50);return;}
  earthMat.uniforms.uBumpTex.value=mkTex('bump-tex');
}
loadBumpTex();

function loadMonthTex(month){
  const mm=String(month).padStart(2,'0');
  const url='textures/'+mm+'.jpg';
  document.getElementById('loading').classList.remove('hidden');
  texLoader.load(url,tex=>{
    tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    earthMat.uniforms.uTex.value=tex;
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('month-label').textContent=MONTH_NAMES[month].charAt(0).toUpperCase()+MONTH_NAMES[month].slice(1);
  });
}
loadMonthTex(curMonth);

/* ══════════ Lat/Lon Grid Overlay ══════════ */
const gridGroup = new THREE.Group();
gridGroup.rotation.x = TILT;
scene.add(gridGroup);
const gridMat = new THREE.LineBasicMaterial({color:0x2088aa,transparent:true,opacity:0.1,depthWrite:false});

function lngLatToVec3(lng,lat,r){
  const phi=(90-lat)*Math.PI/180, theta=(lng+180)*Math.PI/180;
  return new THREE.Vector3(-r*Math.cos(theta)*Math.sin(phi),r*Math.cos(phi),r*Math.sin(theta)*Math.sin(phi));
}
for(let lat=-75;lat<=75;lat+=15){
  const pts=[];for(let lng=-180;lng<=180;lng+=3){const v=lngLatToVec3(lng,lat,1.004);pts.push(v.x,v.y,v.z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  gridGroup.add(new THREE.Line(g,gridMat));
}
for(let lng=-180;lng<180;lng+=15){
  const pts=[];for(let lat=-90;lat<=90;lat+=3){const v=lngLatToVec3(lng,lat,1.004);pts.push(v.x,v.y,v.z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  gridGroup.add(new THREE.Line(g,gridMat));
}

/* ══════════ Stars ══════════ */
(function(){
  const N=6000,pos=new Float32Array(N*3),sz=new Float32Array(N);
  for(let i=0;i<N;i++){const r=50+Math.random()*150,th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
    pos[i*3]=r*Math.sin(ph)*Math.cos(th);pos[i*3+1]=r*Math.sin(ph)*Math.sin(th);pos[i*3+2]=r*Math.cos(ph);sz[i]=.3+Math.random()*1.2;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('size',new THREE.BufferAttribute(sz,1));
  scene.add(new THREE.Points(g,new THREE.ShaderMaterial({
    vertexShader:`attribute float size;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(200.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(.9,.92,1.,smoothstep(.5,.1,d)*.8);}`,
    transparent:true,depthWrite:false})));
})();

/* ══════════ Plate Boundaries ══════════ */
const PB = __PLATE_DATA__;
const boundaryGroup = new THREE.Group();
boundaryGroup.rotation.x = TILT;
scene.add(boundaryGroup);
const resolution = new THREE.Vector2(innerWidth, innerHeight);
const allLineMats = [];
const bPairs = [];

function parsePlate(code){return code.replace(/[\\\/]/g,'-').split('-').map(p=>PLATE_NAMES[p]||p).join(' — ');}

PB.forEach(([btype,plate,coords])=>{
  if(coords.length<2)return;
  const col=BCOLORS[btype]||BCOLORS.u;
  const positions=[];
  coords.forEach(([lng,lat])=>{const v=lngLatToVec3(lng,lat,BOUNDARY_R);positions.push(v.x,v.y,v.z);});

  const gGeo=new LineGeometry();gGeo.setPositions(positions);
  const gMat=new LineMaterial({color:col.glow,linewidth:4,transparent:true,opacity:0.18,resolution,depthWrite:false});
  const gLine=new Line2(gGeo,gMat);gLine.computeLineDistances();
  boundaryGroup.add(gLine);allLineMats.push(gMat);

  const mGeo=new LineGeometry();mGeo.setPositions(positions);
  const mMat=new LineMaterial({color:col.main,linewidth:1.8,transparent:true,opacity:0.9,resolution});
  const mLine=new Line2(mGeo,mMat);mLine.computeLineDistances();
  const plateParts=plate.replace(/[\\\/]/g,'-').split('-');
  mLine.userData={plate,btype,plateParts,label:parsePlate(plate)+' · '+TYPE_LABELS[btype]};
  boundaryGroup.add(mLine);allLineMats.push(mMat);

  bPairs.push({main:mLine,glow:gLine,btype,plate,plateParts,origColor:col.main});
});

/* ══════════ Volcanoes ══════════ */
const V_DATA = __VOLCANOES__;
function makeVSprite(color){
  const cv=document.createElement('canvas');cv.width=128;cv.height=128;
  const x=cv.getContext('2d'),cx=64,cy=64;
  const g=x.createRadialGradient(cx,cy,0,cx,cy,56);
  g.addColorStop(0,color);g.addColorStop(0.35,color+'aa');g.addColorStop(1,color+'00');
  x.fillStyle=g;x.beginPath();x.arc(cx,cy,56,0,Math.PI*2);x.fill();
  x.fillStyle='#fff';x.beginPath();x.arc(cx,cy,8,0,Math.PI*2);x.fill();
  const t=new THREE.CanvasTexture(cv);
  const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,sizeAttenuation:true});
  const s=new THREE.Sprite(m);s.scale.set(0.08,0.08,1);return s;
}
const volcanoGroup = new THREE.Group();
volcanoGroup.rotation.x = TILT;
scene.add(volcanoGroup);
const volcanoSprites = [];
const vCounts = {a:0,d:0,e:0,u:0};
V_DATA.forEach(([lon,lat,name,nameCn,type,typeCn,sc,statusCn,statusEn,region,lastErupt,lastEruptCn])=>{
  vCounts[sc]=(vCounts[sc]||0)+1;
  const sp=makeVSprite(VCOLORS[sc]||VCOLORS.u);
  sp.position.copy(lngLatToVec3(lon,lat,VOLCANO_R));
  sp.userData={name,nameCn,type,typeCn,sc,statusCn,statusEn,region,lastErupt,lastEruptCn,lon,lat};
  volcanoGroup.add(sp);volcanoSprites.push(sp);
});

/* ══════════ Toolbar: Popup Menus ══════════ */
let openMenu=null;
function toggleMenu(menuId,btnEl){
  document.querySelectorAll('.popup-menu').forEach(m=>m.classList.remove('show'));
  document.querySelectorAll('.tb-btn').forEach(b=>b.classList.remove('active'));
  if(openMenu===menuId){openMenu=null;return;}
  openMenu=menuId;
  document.getElementById(menuId).classList.add('show');
  btnEl.classList.add('active');
}
document.addEventListener('click',e=>{
  if(openMenu && !e.target.closest('.tb-btn')){
    document.querySelectorAll('.popup-menu').forEach(m=>m.classList.remove('show'));
    document.querySelectorAll('.tb-btn').forEach(b=>b.classList.remove('active'));
    openMenu=null;
  }
});
document.getElementById('tb-plates').addEventListener('click',e=>{if(!e.target.closest('.popup-menu'))toggleMenu('menu-plates',document.getElementById('tb-plates'));});
document.getElementById('tb-boundary').addEventListener('click',e=>{if(!e.target.closest('.popup-menu'))toggleMenu('menu-boundary',document.getElementById('tb-boundary'));});
document.getElementById('tb-volcano').addEventListener('click',e=>{if(!e.target.closest('.popup-menu'))toggleMenu('menu-volcano',document.getElementById('tb-volcano'));});
document.getElementById('tb-display').addEventListener('click',e=>{if(!e.target.closest('.popup-menu'))toggleMenu('menu-display',document.getElementById('tb-display'));});

/* ══════════ Volcano Filter (exclusive mode) ══════════ */
const vGrid=document.getElementById('volcano-grid');
const vFilter={a:true,d:true,e:true};
let activeVFilter=null;
[{s:'a',c:'#DC143C',l:'活火山'},{s:'d',c:'#FFA500',l:'休眠火山'},{s:'e',c:'#B0C4DE',l:'死火山'}].forEach(o=>{
  const btn=document.createElement('div');btn.className='chip';btn.dataset.status=o.s;
  btn.innerHTML=`<span class="cdot" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${o.l} <small>${vCounts[o.s]||0}</small>`;
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    if(activeVFilter===o.s){
      activeVFilter=null;
      vGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      volcanoSprites.forEach(sp=>{sp.visible=true;});
    }else{
      activeVFilter=o.s;
      vGrid.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.status===o.s));
      volcanoSprites.forEach(sp=>{sp.visible=(sp.userData.sc===o.s);});
    }
  });
  vGrid.appendChild(btn);
});
const hideVBtn=document.createElement('div');hideVBtn.className='chip';hideVBtn.textContent='🚫 隐藏火山';
hideVBtn.addEventListener('click',e=>{
  e.stopPropagation();
  const hidden=volcanoGroup.visible;
  volcanoGroup.visible=!hidden;
  hideVBtn.classList.toggle('active',!volcanoGroup.visible);
  hideVBtn.textContent=volcanoGroup.visible?'🚫 隐藏火山':'👁 显示火山';
});
vGrid.appendChild(hideVBtn);

/* ══════════ Boundary Filter ══════════ */
const bGrid=document.getElementById('boundary-grid');
let highlightBtype = null;
[{t:'c',c:'#ff4444',l:'聚合边界'},{t:'d',c:'#44ff88',l:'分离边界'},{t:'t',c:'#ffcc33',l:'转换断层'}].forEach(o=>{
  const btn=document.createElement('div');btn.className='chip';btn.dataset.btype=o.t;
  btn.innerHTML=`<span class="cline" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${o.l}`;
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    clearPlateHighlight();
    if(highlightBtype===o.t){highlightBtype=null;bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));resetBoundaryColors();return;}
    highlightBtype=o.t;
    bGrid.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.btype===o.t));
    bPairs.forEach(p=>{
      if(p.btype===o.t){p.main.material.linewidth=2.8;p.main.material.opacity=1;p.glow.material.linewidth=7;p.glow.material.opacity=0.35;}
      else{p.main.material.opacity=0.1;p.glow.material.opacity=0.02;}
    });
  });
  bGrid.appendChild(btn);
});
const hideBBtn=document.createElement('div');hideBBtn.className='chip';hideBBtn.textContent='🚫 隐藏边界';
hideBBtn.addEventListener('click',e=>{
  e.stopPropagation();
  boundaryGroup.visible=!boundaryGroup.visible;
  hideBBtn.classList.toggle('active',!boundaryGroup.visible);
  hideBBtn.textContent=boundaryGroup.visible?'🚫 隐藏边界':'👁 显示边界';
});
bGrid.appendChild(hideBBtn);
function resetBoundaryColors(){
  bPairs.forEach(p=>{
    p.main.material.color.setHex(p.origColor);p.main.material.linewidth=1.8;p.main.material.opacity=0.9;
    p.glow.material.color.setHex(p.origColor);p.glow.material.linewidth=4;p.glow.material.opacity=0.18;
  });
}

/* ══════════ Plate Navigation ══════════ */
const pGrid=document.getElementById('plate-grid');
let highlightPlate=null;
function clearPlateHighlight(){
  highlightPlate=null;pGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));resetBoundaryColors();
}
PLATES.forEach(pl=>{
  const btn=document.createElement('button');btn.className='chip';btn.textContent=pl.name;
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    if(splitActive) toggleSplit();
    highlightBtype=null;bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
    if(highlightPlate===pl.name){clearPlateHighlight();return;}
    highlightPlate=pl.name;
    pGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    bPairs.forEach(p=>{
      if(p.plateParts.some(c=>pl.codes.includes(c))){
        p.main.material.color.set(0x44ff88);p.main.material.linewidth=3.5;p.main.material.opacity=1;
        p.glow.material.color.set(0x44ff88);p.glow.material.linewidth=8;p.glow.material.opacity=0.35;
      }else{p.main.material.opacity=0.1;p.glow.material.opacity=0.02;}
    });
    navigateTo(pl.lng,pl.lat,null);
  });
  pGrid.appendChild(btn);
});
const splitBtn=document.createElement('button');splitBtn.id='split-btn';splitBtn.textContent='🔄 拆分板块';
splitBtn.addEventListener('click',e=>{e.stopPropagation();toggleSplit();});
pGrid.appendChild(splitBtn);

/* ══════════ Display Toggles ══════════ */
const dGrid=document.getElementById('display-grid');
const terrainBtn=document.createElement('button');terrainBtn.className='chip';terrainBtn.id='terrain-btn';terrainBtn.textContent='🏔 地形';
terrainBtn.addEventListener('click',e=>{
  e.stopPropagation();
  showBump=!showBump;terrainBtn.classList.toggle('active',showBump);
  earthMat.uniforms.uBumpScale.value=showBump?0.018:0.0;
});
dGrid.appendChild(terrainBtn);

const monthRow=document.createElement('div');
monthRow.style.cssText='display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08)';
const mPrev=document.createElement('button');mPrev.className='chip';mPrev.textContent='◀';mPrev.style.padding='4px 8px';
const mNext=document.createElement('button');mNext.className='chip';mNext.textContent='▶';mNext.style.padding='4px 8px';
const mLabel=document.createElement('span');mLabel.style.cssText='color:rgba(255,255,255,.7);font-size:11px;flex:1;text-align:center';
const MCN=['','1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
let activeMonth=curMonth;
function updateMonthUI(){mLabel.textContent='🌍 '+MCN[activeMonth]+' 地球贴图';}
updateMonthUI();
mPrev.addEventListener('click',e=>{e.stopPropagation();activeMonth=activeMonth<=1?12:activeMonth-1;updateMonthUI();loadMonthTex(activeMonth);});
mNext.addEventListener('click',e=>{e.stopPropagation();activeMonth=activeMonth>=12?1:activeMonth+1;updateMonthUI();loadMonthTex(activeMonth);});
monthRow.appendChild(mPrev);monthRow.appendChild(mLabel);monthRow.appendChild(mNext);
dGrid.appendChild(monthRow);

/* ══════════ Plate Split Feature ══════════ */
const SPLIT_INFO = __PLATE_INFO__;
const splitParent=new THREE.Group();splitParent.rotation.x=TILT;splitParent.visible=false;scene.add(splitParent);
const splitGroups={};
let splitInited=false, splitActive=false, splitProgress=0, splitDir=0;

function initSplit(){
  if(splitInited)return;splitInited=true;
  for(const [name,info] of Object.entries(SPLIT_INFO)){
    const group=new THREE.Group();
    const color=new THREE.Color(info.color);

    if(info.polys){
      info.polys.forEach(seg=>{
        if(seg.length<2)return;
        const pts=[];seg.forEach(([lng,lat])=>{const v=lngLatToVec3(lng,lat,BOUNDARY_R);pts.push(v.x,v.y,v.z);});
        const g=new LineGeometry();g.setPositions(pts);
        const m=new LineMaterial({color:color.getHex(),linewidth:2.5,transparent:true,opacity:0.85,resolution});
        const l=new Line2(g,m);l.computeLineDistances();group.add(l);allLineMats.push(m);
        const gm=new LineMaterial({color:color.getHex(),linewidth:6,transparent:true,opacity:0.2,resolution,depthWrite:false});
        const gg=new LineGeometry();gg.setPositions(pts);
        const gl2=new Line2(gg,gm);gl2.computeLineDistances();group.add(gl2);allLineMats.push(gm);
      });
    }

    const label=makeTextSprite(name,info.color);
    const cPos=lngLatToVec3(info.cx,info.cy,BOUNDARY_R+0.05);
    label.position.copy(cPos);label.scale.set(0.4,0.1,1);
    group.add(label);

    const dir=lngLatToVec3(info.cx,info.cy,1).normalize();
    group.userData={targetOffset:dir.clone().multiplyScalar(1.2)};
    splitParent.add(group);splitGroups[name]=group;
  }
}

function makeTextSprite(text,color){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;
  const ctx=cv.getContext('2d');
  ctx.font='bold 42px PingFang SC,sans-serif';
  const tw=ctx.measureText(text).width;
  const px=20,rx=(512-tw)/2-px,rw=tw+px*2;
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.beginPath();ctx.moveTo(rx+10,10);ctx.arcTo(rx+rw,10,rx+rw,108,10);ctx.arcTo(rx+rw,108,rx,108,10);ctx.arcTo(rx,108,rx,10,10);ctx.arcTo(rx,10,rx+rw,10,10);ctx.fill();
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,60);
  const t=new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
}

function toggleSplit(){
  initSplit();
  splitActive=!splitActive;
  splitDir=splitActive?1:-1;
  splitBtn.classList.toggle('active',splitActive);
  splitBtn.textContent=splitActive?'🔄 合并板块':'🔄 拆分板块';
  if(splitActive){
    splitParent.visible=true;
    autoRotate=false;manualPause=true;pauseBtn.textContent='▶';
    clearPlateHighlight();highlightBtype=null;bRow.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
  }
}

/* ══════════ Navigation System ══════════ */
let navAnim=null;
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
let savedView=null;
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
/* ══════════ Select Volcano (hide others) ══════════ */
let selectedVolcano=null;
function selectVolcano(sp){
  selectedVolcano=sp;
  volcanoSprites.forEach(s=>{if(s!==sp)s.visible=false;});
  sp.visible=true;
}
function deselectVolcano(){
  if(!selectedVolcano)return;
  selectedVolcano=null;
  volcanoSprites.forEach(sp=>{
    sp.visible = activeVFilter ? (sp.userData.sc===activeVFilter) : true;
  });
}

window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    deselectVolcano();restoreView();
    tooltipEl.style.display='none';clusterEl.style.display='none';
    document.getElementById('search-results').style.display='none';
  }
});

/* ══════════ Double-click Zoom ══════════ */
renderer.domElement.addEventListener('dblclick',e=>{
  e.preventDefault();
  const mx=(e.clientX/innerWidth)*2-1, my=-(e.clientY/innerHeight)*2+1;
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

/* ══════════ Click: select volcano or deselect ══════════ */
renderer.domElement.addEventListener('click',e=>{
  if(splitActive){return;}
  if(!volcanoGroup.visible){if(selectedVolcano)deselectVolcano();return;}
  const mx=(e.clientX/innerWidth)*2-1, my=-(e.clientY/innerHeight)*2+1;
  const rc=new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(mx,my),camera);
  const eDist=earthDist(rc);
  const vis=volcanoSprites.filter(s=>s.visible&&isVisible(s));
  const hits=rc.intersectObjects(vis).filter(h=>h.distance<eDist+0.01&&isVisible(h.object));
  if(hits.length>0){
    const sp=hits[0].object;
    selectVolcano(sp);zoomToVolcano(sp.userData);
  }else if(selectedVolcano){
    deselectVolcano();
  }
});

/* ══════════ Search Volcano ══════════ */
const searchInput=document.getElementById('volcano-search');
const searchResults=document.getElementById('search-results');
let searchTimeout=null;
searchInput.addEventListener('input',()=>{
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{
    const q=searchInput.value.trim().toLowerCase();
    if(q.length<1){searchResults.style.display='none';return;}
    const matches=volcanoSprites.filter(sp=>{
      const d=sp.userData;
      return d.name.toLowerCase().includes(q)||d.nameCn.includes(q);
    }).slice(0,12);
    if(matches.length===0){searchResults.innerHTML='<div class="sr-item" style="color:rgba(255,255,255,.4)">未找到匹配火山</div>';searchResults.style.display='block';return;}
    searchResults.innerHTML=matches.map((sp,i)=>{
      const d=sp.userData;const dc=VCOLORS[d.sc]||VCOLORS.u;
      return `<div class="sr-item" data-sidx="${i}"><span class="sr-name"><span style="color:${dc}">●</span> ${d.nameCn!==d.name?d.nameCn+' ':''}<small>${d.name}</small></span><span class="sr-sub">${d.statusCn}</span></div>`;
    }).join('');
    searchResults.style.display='block';
    searchResults.querySelectorAll('.sr-item').forEach((el,i)=>{
      el.addEventListener('click',()=>{
        const sp=matches[i];if(!sp)return;
        searchResults.style.display='none';searchInput.value='';
        selectVolcano(sp);zoomToVolcano(sp.userData);
      });
    });
  },150);
});
searchInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    const q=searchInput.value.trim().toLowerCase();
    if(!q)return;
    const sp=volcanoSprites.find(s=>{
      const d=s.userData;
      return d.name.toLowerCase()===q||d.nameCn===q||d.name.toLowerCase().includes(q)||d.nameCn.includes(q);
    });
    if(sp){searchResults.style.display='none';searchInput.value='';selectVolcano(sp);zoomToVolcano(sp.userData);}
  }
  if(e.key==='Escape'){searchResults.style.display='none';searchInput.blur();}
});
searchInput.addEventListener('blur',()=>{setTimeout(()=>{searchResults.style.display='none';},200);});

/* ══════════ Tooltip / Cluster ══════════ */
const raycaster=new THREE.Raycaster();raycaster.params.Line2={threshold:0.02};
const mouse=new THREE.Vector2();
function earthDist(rc){
  const h=rc.intersectObject(earth);
  return h.length>0?h[0].distance:Infinity;
}
function isVisible(sp){
  const wp=new THREE.Vector3();sp.getWorldPosition(wp);
  return wp.dot(camera.position)>0;
}
const tooltipEl=document.getElementById('tooltip');
const clusterEl=document.getElementById('cluster-popup');
let clusterHovered=false,clusterData=[];
clusterEl.addEventListener('mouseenter',()=>{clusterHovered=true;});
clusterEl.addEventListener('mouseleave',()=>{clusterHovered=false;setTimeout(()=>{if(!clusterHovered)clusterEl.style.display='none';},250);});

function screenPos(sp){const v=sp.position.clone();v.applyMatrix4(volcanoGroup.matrixWorld);v.project(camera);return{x:(v.x+1)/2*innerWidth,y:(-v.y+1)/2*innerHeight,z:v.z};}

function tipHTML(d){
  const dc=VCOLORS[d.sc]||VCOLORS.u;
  const nameLine = d.nameCn && d.nameCn!==d.name
    ? `<div class="tip-name-cn">${d.nameCn}</div><div class="tip-name-en">${d.name}</div>`
    : `<div class="tip-name-cn">${d.name}</div>`;
  return `${nameLine}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">类型</span><span class="tip-val">${d.typeCn}（${d.type}）</span></div>
<div class="tip-row"><span class="tip-label">活跃度</span><span class="tip-val" style="color:${dc}">${d.statusCn}（${d.statusEn}）</span></div>
<div class="tip-row"><span class="tip-label">位置</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">上次喷发</span><span class="tip-val">${d.lastEruptCn||'未知'}</span></div>`;
}
function posEl(el,x,y){el.style.display='block';el.style.transform='';requestAnimationFrame(()=>{const r=el.getBoundingClientRect();let l=x+16,t=y-12;if(l+r.width>innerWidth-16)l=x-r.width-16;if(t+r.height>innerHeight-16)t=innerHeight-r.height-16;if(t<16)t=16;el.style.left=l+'px';el.style.top=t+'px';});}

let clusterSprites=[];
function buildCluster(sprites,mx,my){
  clusterSprites=sprites;clusterData=sprites.map(s=>s.userData);
  let h=`<div class="cl-title">📍 区域内火山（${sprites.length}个）</div>`;
  clusterData.forEach((d,i)=>{const dc=VCOLORS[d.sc]||VCOLORS.u;
    const cn=d.nameCn&&d.nameCn!==d.name?d.nameCn+' ':''
    h+=`<div class="cl-item" data-idx="${i}"><div class="cl-dot" style="background:${dc};box-shadow:0 0 3px ${dc}"></div><div><div class="cl-name">${cn}<small>${d.name}</small></div><div class="cl-sub">${d.typeCn} · ${d.statusCn}</div></div></div>`;
  });
  h+=`<div id="cl-detail"></div>`;
  clusterEl.innerHTML=h;posEl(clusterEl,mx,my);

  clusterEl.querySelectorAll('.cl-item').forEach(item=>{
    item.addEventListener('mouseenter',()=>{
      const d=clusterData[parseInt(item.dataset.idx)];if(!d)return;
      const det=document.getElementById('cl-detail');const dc=VCOLORS[d.sc]||VCOLORS.u;
      const nm = d.nameCn&&d.nameCn!==d.name?`<div class="tip-name-cn">${d.nameCn}</div><div class="tip-name-en">${d.name}</div>`:`<div class="tip-name-cn">${d.name}</div>`;
      det.innerHTML=`${nm}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">类型</span><span class="tip-val">${d.typeCn}（${d.type}）</span></div>
<div class="tip-row"><span class="tip-label">活跃度</span><span class="tip-val" style="color:${dc}">${d.statusCn}（${d.statusEn}）</span></div>
<div class="tip-row"><span class="tip-label">位置</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">上次喷发</span><span class="tip-val">${d.lastEruptCn||'未知'}</span></div>`;
    });
    item.addEventListener('click',()=>{
      const sp=clusterSprites[parseInt(item.dataset.idx)];if(!sp)return;
      clusterEl.style.display='none';clusterHovered=false;
      selectVolcano(sp);zoomToVolcano(sp.userData);
    });
  });
}

renderer.domElement.addEventListener('pointermove',e=>{
  if(clusterHovered)return;
  const barEl=document.getElementById('bottom-bar');
  const barRect=barEl.getBoundingClientRect();
  const overBar=e.clientY>=barRect.top;
  const overPopup=document.querySelector('.popup-menu.show');
  const inPopup=overPopup&&overPopup.getBoundingClientRect().top<=e.clientY&&e.clientX>=overPopup.getBoundingClientRect().left&&e.clientX<=overPopup.getBoundingClientRect().right;
  if(splitActive||overBar||inPopup){tooltipEl.style.display='none';clusterEl.style.display='none';document.body.style.cursor='default';return;}
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const eDist=earthDist(raycaster);
  if(volcanoGroup.visible){
    const vis=volcanoSprites.filter(s=>s.visible&&isVisible(s));
    const vHits=raycaster.intersectObjects(vis).filter(h=>h.distance<eDist+0.01&&isVisible(h.object));
    if(vHits.length>0){
      const mx=e.clientX,my=e.clientY;
      const nearby=[];vis.forEach(sp=>{const p=screenPos(sp);if(p.z>1)return;const dx=p.x-mx,dy=p.y-my;if(Math.sqrt(dx*dx+dy*dy)<CLUSTER_PX)nearby.push(sp);});
      if(nearby.length>1){tooltipEl.style.display='none';buildCluster(nearby,mx,my);document.body.style.cursor='pointer';return;}
      clusterEl.style.display='none';tooltipEl.innerHTML=tipHTML(vHits[0].object.userData);posEl(tooltipEl,mx,my);document.body.style.cursor='pointer';return;
    }
  }
  clusterEl.style.display='none';
  if(boundaryGroup.visible){
    let closest=null,cDist=Infinity;
    for(const line of bPairs.map(p=>p.main)){if(!line.visible)continue;const ints=raycaster.intersectObject(line);if(ints.length&&ints[0].distance<eDist+0.01&&ints[0].distance<cDist){cDist=ints[0].distance;closest=line;}}
    if(closest){tooltipEl.textContent=closest.userData.label;posEl(tooltipEl,e.clientX,e.clientY);document.body.style.cursor='pointer';return;}
  }
  tooltipEl.style.display='none';document.body.style.cursor='default';
});

/* ══════════ Pause ══════════ */
let autoRotate=true,manualPause=false,idleTimer;
const pauseBtn=document.getElementById('pause-btn');
pauseBtn.addEventListener('click',()=>{manualPause=!manualPause;autoRotate=!manualPause;pauseBtn.textContent=manualPause?'▶':'⏸';if(manualPause)clearTimeout(idleTimer);});
controls.addEventListener('start',()=>{autoRotate=false;clearTimeout(idleTimer);});
controls.addEventListener('end',()=>{clearTimeout(idleTimer);if(!manualPause)idleTimer=setTimeout(()=>{autoRotate=true;},3000);});

/* ══════════ Resize ══════════ */
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);resolution.set(innerWidth,innerHeight);
  allLineMats.forEach(m=>m.resolution.copy(resolution));
});

/* ══════════ Animate ══════════ */
function syncRotY(){
  boundaryGroup.rotation.y=earth.rotation.y;
  volcanoGroup.rotation.y=earth.rotation.y;gridGroup.rotation.y=earth.rotation.y;
  splitParent.rotation.y=earth.rotation.y;
}

(function animate(){
  requestAnimationFrame(animate);
  const t=performance.now()*0.001;

  /* navigation */
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
  }else{
    if(autoRotate){earth.rotation.y+=0.001;syncRotY();}
    controls.update();
  }

  /* split animation */
  if(splitDir!==0){
    splitProgress+=splitDir*0.018;splitProgress=Math.max(0,Math.min(1,splitProgress));
    const ease=splitProgress*splitProgress*(3-2*splitProgress);
    for(const g of Object.values(splitGroups)){g.position.copy(g.userData.targetOffset.clone().multiplyScalar(ease));}
    earthMat.uniforms.uOpacity.value=1-ease*0.6;
    boundaryGroup.visible=ease<0.5;
    if(splitProgress<=0&&splitDir===-1){splitDir=0;splitParent.visible=false;earthMat.uniforms.uOpacity.value=1;boundaryGroup.visible=true;}
    if(splitProgress>=1)splitDir=0;
  }

  /* volcano pulse */
  volcanoSprites.forEach((sp,i)=>{if(sp.visible)sp.material.opacity=0.72+0.28*Math.sin(t*2.5+i*0.6);});

  earthMat.uniforms.uCam.value.copy(camera.position);
  renderer.render(scene,camera);
})();
</script>
</body>
</html>'''

html = template.replace('__BUMP_B64__', bump_b64) \
               .replace('__PLATE_DATA__', plate_data_json) \
               .replace('__VOLCANOES__', volcanoes_json) \
               .replace('__PLATE_INFO__', split_json)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

sz = os.path.getsize('index.html')
print(f"Done. index.html: {sz/1024/1024:.1f} MB")

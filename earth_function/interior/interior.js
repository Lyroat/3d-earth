import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { t, getLang } from '../../i18n/lang.js';

// 地球各层配置：name=中文名, rOuter/rInner=外/内归一化半径(1.0=地表), color=颜色, depth=深度, temp=温度, comp=成分, state=物态
const LAYERS = [
  {name:'地壳',nameEn:'Crust',rOuter:1.0,rInner:0.995,color:0x8B4513,depth:'0~35 km',temp:'~400°C',comp:'硅铝质/硅镁质岩石',state:'固态'},
  {name:'岩石圈地幔',nameEn:'Lithospheric Mantle',rOuter:0.995,rInner:0.984,color:0x556B2F,depth:'35~100 km',temp:'400~600°C',comp:'橄榄岩（富铁镁矿物）',state:'固态'},
  {name:'软流圈',nameEn:'Asthenosphere',rOuter:0.984,rInner:0.957,color:0xCC4400,depth:'100~270 km',temp:'600~900°C',comp:'部分熔融橄榄岩',state:'塑性/半熔融'},
  {name:'过渡带',nameEn:'Transition Zone',rOuter:0.957,rInner:0.896,color:0xE65C00,depth:'270~660 km',temp:'900~1600°C',comp:'高压矿物（瓦兹利石、林伍德石）',state:'固态（高压）'},
  {name:'下地幔',nameEn:'Lower Mantle',rOuter:0.896,rInner:0.546,color:0xB22222,depth:'660~2891 km',temp:'1600~3700°C',comp:'钙钛矿型硅酸盐',state:'固态（高压蠕变）'},
  {name:'外核',nameEn:'Outer Core',rOuter:0.546,rInner:0.192,color:0xFF8C00,depth:'2891~5150 km',temp:'3700~5000°C',comp:'铁镍合金',state:'液态'},
  {name:'内核',nameEn:'Inner Core',rOuter:0.192,rInner:0.0,color:0xFFD700,depth:'5150~6371 km',temp:'5000~6000°C',comp:'固态铁镍合金',state:'固态（极高压）'}
];

function getKcInterior(key) {
  return { title: t('kc.'+key+'.title'), desc: t('kc.'+key+'.desc') };
}

// 各层聚焦时的归一化半径范围（min~max），用于截面Shader高亮对应区域
const LAYER_RANGES = {
  'crust':      {min:0.995, max:1.0},
  'lithosphere':{min:0.984, max:1.0},
  'mantle':     {min:0.546, max:0.995},
  'upper-mantle':{min:0.896, max:0.995},
  'litho-mantle':{min:0.984, max:0.995},
  'astheno':     {min:0.957, max:0.984},
  'transition':  {min:0.896, max:0.957},
  'lower-mantle':{min:0.546, max:0.896},
  'core':       {min:0.0,   max:0.546},
  'outer-core': {min:0.192, max:0.546},
  'inner-core': {min:0.0,   max:0.192}
};

export function init({ scene, resolution, allLineMats }, deps) {
  const interiorGroup = new THREE.Group();
  interiorGroup.visible = false;
  scene.add(interiorGroup);

  // 截面Shader：顶点着色器传递位置，片元着色器用噪声函数(fbm/fbm6)生成地质纹理
  const csVS = `varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const csFS = `
uniform float uFocusMin;
uniform float uFocusMax;
uniform float uFocusMode;
uniform float uTime;
varying vec3 vPos;
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2d(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),
    mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0;v+=noise2d(p*1.0)*0.5;v+=noise2d(p*2.0)*0.25;
  v+=noise2d(p*4.0)*0.125;v+=noise2d(p*8.0)*0.0625;return v;
}
float fbm6(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<6;i++){v+=noise2d(p)*a;p*=2.03;a*=0.48;}
  return v;
}
void main(){
  float r=length(vPos);
  if(r>1.0) discard;
  vec3 c;
  float n;
  float ang=atan(vPos.y,vPos.x);
  if(r<0.957){ // 过渡带以内：从内核到下地幔的颜色渐变
    float rr=r/0.957;
    // g0~g5: 内核→外核的颜色渐变色阶（金白→金黄→橙→橙红→深红→深红棕）
    vec3 g0=vec3(1.0,1.0,0.92);
    vec3 g1=vec3(1.0,0.93,0.55);
    vec3 g2=vec3(1.0,0.60,0.15);
    vec3 g3=vec3(0.88,0.33,0.05);
    vec3 g4=vec3(0.52,0.13,0.03);
    vec3 g5=vec3(0.25,0.07,0.03);
    c=mix(g0,g1,smoothstep(0.0,0.18,rr));
    c=mix(c,g2,smoothstep(0.12,0.42,rr));
    c=mix(c,g3,smoothstep(0.38,0.62,rr));
    c=mix(c,g4,smoothstep(0.58,0.82,rr));
    c=mix(c,g5,smoothstep(0.78,1.0,rr));
    if(r<0.192){ // 内核区域：中心发光效果，越靠近核心越亮
      float t=r/0.192;
      n=fbm(vPos.xy*6.0);
      float icGlow=1.0-smoothstep(0.3,1.0,t);
      c+=vec3(0.28,0.20,0.07)*icGlow;
      c+=vec3(0.04,0.02,0.01)*n*icGlow;
    }else if(r<0.546){ // 外核区域：液态铁镍的流动火焰纹理效果（多层fbm6叠加）
      float t=(r-0.192)/(0.546-0.192);
      float slow=uTime*0.15;
      float med=uTime*0.3;
      float ocFade=smoothstep(0.0,0.2,t)*(1.0-smoothstep(0.8,1.0,t));
      vec2 polar=vec2(r*8.0, ang*3.0);
      float flame1=fbm6(polar+vec2(0.3-slow,0.7+slow*0.7));
      float flame2=fbm6(polar*1.5+vec2(2.1-med,1.3-slow));
      float streak=fbm6(vec2(ang*5.0+r*12.0-med*0.8, r*6.0-slow));
      float swirl=fbm6(vec2(ang*4.0-slow*1.2, r*10.0-slow*0.5));
      float detail=noise2d(vPos.xy*20.0+vec2(slow*0.5));
      c+=vec3(0.10,0.05,0.01)*(flame1*0.6+flame2*0.4)*ocFade;
      c+=vec3(0.08,0.04,0.01)*smoothstep(0.35,0.65,streak)*ocFade;
      c+=vec3(0.06,0.03,0.01)*smoothstep(0.4,0.7,swirl)*(1.0-t*0.5)*ocFade;
      c+=vec3(0.04,0.02,0.0)*detail*ocFade;
    }else{
      float t=(r-0.546)/(0.957-0.546);
      float mtFade=smoothstep(0.0,0.12,t);
      float n1=fbm6(vPos.xy*5.0);
      float n2=noise2d(vPos.xy*18.0);
      float n4=noise2d(vPos.xy*70.0);
      float grain=noise2d(vPos.xy*55.0)*0.5+noise2d(vPos.xy*90.0)*0.3+noise2d(vPos.xy*150.0)*0.2;
      c+=vec3(0.03,0.008,0.003)*n1*mtFade;
      c+=vec3(0.02,0.005,0.002)*n2*mtFade;
      float rocky=smoothstep(0.3,0.7,grain);
      c=mix(c,c*0.82,rocky*0.3*mtFade);
      c+=vec3(0.01,0.003,0.0)*n4*mtFade;
      float hotSpot=smoothstep(0.6,0.8,noise2d(vPos.xy*8.0+vec2(n1)));
      c+=vec3(0.04,0.01,0.0)*hotSpot*(1.0-t*0.7)*mtFade;
    }
    c=clamp(c,0.0,1.0);
  }else if(r<0.984){
    float t=(r-0.957)/(0.984-0.957);
    float n1=fbm6(vPos.xy*6.0+vec2(0.5,0.2));
    float n2=noise2d(vPos.xy*25.0);
    float n3=noise2d(vPos.xy*50.0);
    float grain=noise2d(vPos.xy*65.0)*0.5+noise2d(vPos.xy*100.0)*0.5;
    vec3 base=mix(vec3(0.25,0.07,0.04),vec3(0.20,0.06,0.04),t);
    base+=vec3(0.05,0.012,0.0)*n1;
    base+=vec3(0.03,0.008,0.0)*n2;
    base=mix(base,base*0.8,smoothstep(0.3,0.7,grain)*0.25);
    float flow=smoothstep(0.4,0.65,noise2d(vPos.xy*10.0+vec2(n1*2.0)));
    base+=vec3(0.06,0.015,0.005)*flow;
    c=base;
  }else{
    float t=(r-0.984)/(1.0-0.984);
    float n1=fbm(vPos.xy*10.0);
    float n2=noise2d(vPos.xy*35.0);
    float n3=noise2d(vPos.xy*70.0);
    vec3 base=mix(vec3(0.26,0.19,0.14),vec3(0.20,0.15,0.11),n1);
    base+=vec3(0.05)*n2+vec3(0.025)*n3;
    base*=0.88+0.12*t;
    c=base;
  }
  if(uFocusMode>0.5){ // 聚焦模式：非聚焦区域变灰变暗
    if(r<uFocusMin||r>uFocusMax){
      float gray=dot(c,vec3(0.299,0.587,0.114));
      c=mix(c,vec3(gray),0.8); // 灰度混合80%
      c*=0.5; // 亮度降低到50%
    }
  }
  gl_FragColor=vec4(c,1.0);
}`;

  const csMat = new THREE.ShaderMaterial({
    vertexShader:csVS, fragmentShader:csFS,
    uniforms:{uFocusMin:{value:0.0},uFocusMax:{value:1.0},uFocusMode:{value:0.0},uTime:{value:0.0}},
    side:THREE.DoubleSide, transparent:true
  });

  const crossSectionGroup = new THREE.Group();
  crossSectionGroup.visible = false;
  scene.add(crossSectionGroup);

  function makeCSPlane(rotation){
    const geo=new THREE.CircleGeometry(1.0,128); // 半径1.0的圆，128段细分保证边缘平滑
    const mesh=new THREE.Mesh(geo,csMat);
    mesh.rotation.set(...rotation);
    crossSectionGroup.add(mesh);
    return mesh;
  }
  makeCSPlane([0,0,0]);
  makeCSPlane([-Math.PI/2,0,0]);
  makeCSPlane([0,Math.PI/2,0]);

  /* Layer labels + leader lines */
  const labelSprites = [];
  const leaderLines = [];

  function makeLabelSprite(text,position,layerData){
    const cv=document.createElement('canvas');cv.width=512;cv.height=64;
    const ctx=cv.getContext('2d');
    ctx.font='700 44px sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.letterSpacing='2px';
    ctx.fillText(text,8,32);
    const tex=new THREE.CanvasTexture(cv);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    sp.scale.set(0.55,0.08,1); // 标签精灵尺寸：宽0.55 高0.08
    sp.position.copy(position);
    sp.userData=layerData;
    interiorGroup.add(sp);
    labelSprites.push(sp);
    return sp;
  }
  function makeLeaderLine(points){
    const pts=[];
    points.forEach(p=>{pts.push(p.x,p.y,p.z+0.01);});
    const geo=new LineGeometry();geo.setPositions(pts);
    const mat=new LineMaterial({color:0xffffff,linewidth:3,transparent:true,opacity:0.5,worldUnits:false,resolution}); // 引线：白色, 粗3px, 半透明50%
    const line=new Line2(geo,mat);line.computeLineDistances();
    interiorGroup.add(line);allLineMats.push(mat);
    leaderLines.push(line);
    return line;
  }

  const LABEL_X = 1.45; // 标签X轴位置，越大离地球越远
  const labelCfg = [
    {aR:0.998, labelY:0.82}, {aR:0.990, labelY:0.66}, {aR:0.970, labelY:0.54},
    {aR:0.926, labelY:0.44}, {aR:0.720, labelY:0.34}, {aR:0.370, labelY:0.24},
    {aR:0.096, labelY:0.14}
  ];
  LAYERS.forEach((L,i)=>{
    const cfg=labelCfg[i];
    const midR=(L.rOuter+L.rInner)/2;
    const angle=Math.PI*0.28;
    const ax=midR*Math.cos(angle);
    const ay=midR*Math.sin(angle);
    const kneeX=ax+Math.abs(cfg.labelY-ay);
    const from=new THREE.Vector3(ax,ay,0);
    const knee=new THREE.Vector3(kneeX, cfg.labelY, 0);
    const to=new THREE.Vector3(LABEL_X, cfg.labelY, 0);
    makeLeaderLine([from,knee,to]);
    makeLabelSprite(getLang()==='zh' ? L.name : L.nameEn, new THREE.Vector3(LABEL_X+0.30, cfg.labelY, 0),L);
  });

  /* Interior mode toggle */
  let interiorMode = false;
  const layerPanel = document.getElementById('interior-sub');

  function toggleInterior(){
    interiorMode = !interiorMode;
    interiorGroup.visible = interiorMode;
    crossSectionGroup.visible = interiorMode;

    if(interiorMode){
      deps.volcanoGroup.visible = false;
      deps.boundaryGroup.visible = false;
      deps.gridGroup.visible = false;
      deps.earthMat.uniforms.uClipInterior.value = 1.0;
      deps.setActivePanel('interior');
    } else {
      deps.earthMat.uniforms.uClipInterior.value = 0.0;
      activeLayer = null;
      deps.setActivePanel(null);
      csMat.uniforms.uFocusMode.value = 0.0;
      if(layerPanel) layerPanel.querySelectorAll('.lp-btn').forEach(b=>b.classList.remove('active'));
      updateLabelVisibility(null);
      deps.hideKC();
    }
  }

  /* Layer focus panel */
  let activeLayer = null;

  function updateLabelVisibility(range){
    LAYERS.forEach((L,i)=>{
      const visible=!range||(L.rInner<range.max&&L.rOuter>range.min);
      if(labelSprites[i]) labelSprites[i].visible=visible;
      if(leaderLines[i]) leaderLines[i].visible=visible;
    });
  }

  function setLayerFocus(key){
    const btns=layerPanel.querySelectorAll('.lp-btn');
    if(activeLayer===key){
      activeLayer=null;
      csMat.uniforms.uFocusMode.value=0.0;
      btns.forEach(b=>b.classList.remove('active'));
      updateLabelVisibility(null);
      deps.hideKC();
      return;
    }
    activeLayer=key;
    const range=LAYER_RANGES[key];
    csMat.uniforms.uFocusMin.value=range.min;
    csMat.uniforms.uFocusMax.value=range.max;
    csMat.uniforms.uFocusMode.value=1.0;
    btns.forEach(b=>b.classList.toggle('active',b.dataset.layer===key));
    updateLabelVisibility(range);
    deps.showKC(getKcInterior(key));
  }

  layerPanel.querySelectorAll('.lp-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();setLayerFocus(btn.dataset.layer);});
  });
  document.getElementById('lp-reset').addEventListener('click',e=>{
    e.stopPropagation();
    activeLayer=null;
    csMat.uniforms.uFocusMode.value=0.0;
    layerPanel.querySelectorAll('.lp-btn').forEach(b=>b.classList.remove('active'));
    updateLabelVisibility(null);
    deps.hideKC();
  });

  function interiorHover(){ return false; }

  function updateTime(t){
    if(interiorMode) csMat.uniforms.uTime.value = t;
  }

  return {
    get interiorMode(){ return interiorMode; },
    toggleInterior,
    interiorHover,
    updateTime,
  };
}

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const LAYERS = [
  {name:'地壳',nameEn:'Crust',rOuter:1.0,rInner:0.995,color:0x8B4513,depth:'0~35 km',temp:'~400°C',comp:'硅铝质/硅镁质岩石',state:'固态'},
  {name:'岩石圈地幔',nameEn:'Lithospheric Mantle',rOuter:0.995,rInner:0.984,color:0x556B2F,depth:'35~100 km',temp:'400~600°C',comp:'橄榄岩（富铁镁矿物）',state:'固态'},
  {name:'软流圈',nameEn:'Asthenosphere',rOuter:0.984,rInner:0.957,color:0xCC4400,depth:'100~270 km',temp:'600~900°C',comp:'部分熔融橄榄岩',state:'塑性/半熔融'},
  {name:'过渡带',nameEn:'Transition Zone',rOuter:0.957,rInner:0.896,color:0xE65C00,depth:'270~660 km',temp:'900~1600°C',comp:'高压矿物（瓦兹利石、林伍德石）',state:'固态（高压）'},
  {name:'下地幔',nameEn:'Lower Mantle',rOuter:0.896,rInner:0.546,color:0xB22222,depth:'660~2891 km',temp:'1600~3700°C',comp:'钙钛矿型硅酸盐',state:'固态（高压蠕变）'},
  {name:'外核',nameEn:'Outer Core',rOuter:0.546,rInner:0.192,color:0xFF8C00,depth:'2891~5150 km',temp:'3700~5000°C',comp:'铁镍合金',state:'液态'},
  {name:'内核',nameEn:'Inner Core',rOuter:0.192,rInner:0.0,color:0xFFD700,depth:'5150~6371 km',temp:'5000~6000°C',comp:'固态铁镍合金',state:'固态（极高压）'}
];

const KC_DATA_INTERIOR = {
  'crust':{title:'地壳',desc:'<p>地球最外层的固体外壳，是人类直接生活和活动的部分。</p><div class="kc-subtitle">关键特征</div><ul><li>厚度不均：大陆地壳约 30–70 千米，海洋地壳约 5–10 千米</li><li>主要成分：硅酸盐矿物（如长石、石英）</li><li>密度较低，是地球最"轻"的一层</li><li>与上地幔顶部共同构成岩石圈</li></ul>'},
  'mantle':{title:'地幔',desc:'<p>位于地壳与地核之间的厚层结构，占地球体积约84%。</p><div class="kc-subtitle">关键特征</div><ul><li>深度范围：35–2900 千米处</li><li>主要成分：富含镁和铁的硅酸盐矿物（如橄榄石）</li><li>上地幔部分存在软流圈，具有塑性，可缓慢流动</li><li>是地幔对流的发生区域，驱动板块运动</li></ul>'},
  'core':{title:'地核',desc:'<p>地球最内部的结构，主要由金属组成。</p><div class="kc-subtitle">关键特征</div><ul><li>分为：外核（液态）和内核（固态）</li><li>主要成分：铁、镍</li><li>外核流动形成地磁场</li><li>温度极高，可达 5000℃ 以上</li></ul>'},
  'lithosphere':{title:'岩石圈',desc:'<p>地球最外层的刚性层，由地壳和上地幔最顶部组成。</p><div class="kc-subtitle">关键特征</div><ul><li>厚度：约 100 千米（海、陆变化较大）</li><li>被分割成多个板块</li><li>具有刚性，整体作为"板块"运动</li></ul>'},
  'upper-mantle':{title:'上地幔',desc:'<p>位于地壳之下，是地球内部最上层的地幔区域。</p><div class="kc-subtitle">关键特征</div><ul><li>深度范围：约从地壳底部延伸至约 660 千米深的位置</li><li>主要成分：富含镁、铁的硅酸盐矿物（以橄榄石为主）</li><li>温度和压力随深度增加而升高</li><li>是地幔对流的重要起始区域，直接驱动板块运动</li></ul>'},
  'astheno':{title:'软流圈',desc:'<p>位于岩石圈之下的上地幔部分，具有塑性和流动性。</p><div class="kc-subtitle">关键特征</div><ul><li>深度范围：100–350 千米处</li><li>温度接近岩石熔点</li><li>不是液体，但可以缓慢流动</li><li>为板块运动提供"滑动基础"</li></ul>'},
  'litho-mantle':{title:'岩石圈地幔',desc:'<p>上地幔最顶部的部分，属于刚性结构（岩石圈）的一部分。</p><div class="kc-subtitle">关键特征</div><ul><li>与地壳共同组成岩石圈</li><li>物质组成：以橄榄石矿物为主的超镁铁质岩石</li><li>具有刚性，不易流动</li><li>会随板块整体运动</li><li>与下方的软流圈在力学性质上明显不同</li></ul>'},
  'transition':{title:'过渡带',desc:'<p>上地幔与下地幔之间的过渡区域。</p><div class="kc-subtitle">关键特征</div><ul><li>深度范围：410–660 千米处</li><li>主要特征：矿物发生高压相变（如橄榄石转变为更致密结构）</li><li>密度和地震波速度发生明显变化</li><li>对地幔对流起"阻挡或调节"作用（部分物质可穿越）</li></ul>'},
  'lower-mantle':{title:'下地幔',desc:'<p>位于过渡带之下、外核之上的地幔部分。</p><div class="kc-subtitle">关键特征</div><ul><li>深度范围：660–2900 千米处</li><li>压力和温度极高</li><li>物质仍为固态，但可发生极缓慢流动</li><li>是深部地幔对流的重要区域</li><li>成分更加致密（如钙钛矿结构矿物）</li></ul>'},
  'outer-core':{title:'外核',desc:'<p>地核的外层，为液态金属层。</p><div class="kc-subtitle">关键特征</div><ul><li>厚度：约 2270 千米</li><li>主要成分：液态铁、镍</li><li>可以流动，是地磁场产生的根本原因（地磁发电机机制）</li><li>横波无法通过（证明其为液态）</li></ul>'},
  'inner-core':{title:'内核',desc:'<p>地球最中心的部分，为固态金属球体。</p><div class="kc-subtitle">关键特征</div><ul><li>半径：约 1216 千米</li><li>主要成分：铁、镍</li><li>温度极高，但因压力极大而保持固态</li><li>可能存在各向异性（地震波传播速度方向不同）</li></ul>'},
};

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
  if(r<0.957){
    float rr=r/0.957;
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
    if(r<0.192){
      float t=r/0.192;
      n=fbm(vPos.xy*6.0);
      float icGlow=1.0-smoothstep(0.3,1.0,t);
      c+=vec3(0.28,0.20,0.07)*icGlow;
      c+=vec3(0.04,0.02,0.01)*n*icGlow;
    }else if(r<0.546){
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
  if(uFocusMode>0.5){
    if(r<uFocusMin||r>uFocusMax){
      float gray=dot(c,vec3(0.299,0.587,0.114));
      c=mix(c,vec3(gray),0.8);
      c*=0.5;
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
    const geo=new THREE.CircleGeometry(1.0,128);
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
    sp.scale.set(0.55,0.08,1);
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
    const mat=new LineMaterial({color:0xffffff,linewidth:3,transparent:true,opacity:0.5,worldUnits:false,resolution});
    const line=new Line2(geo,mat);line.computeLineDistances();
    interiorGroup.add(line);allLineMats.push(mat);
    leaderLines.push(line);
    return line;
  }

  const LABEL_X = 1.45;
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
    makeLabelSprite(L.name,new THREE.Vector3(LABEL_X+0.30, cfg.labelY, 0),L);
  });

  /* Interior mode toggle */
  let interiorMode = false;
  const layerPanel = document.getElementById('layer-panel');

  function toggleInterior(){
    interiorMode = !interiorMode;
    interiorGroup.visible = interiorMode;
    crossSectionGroup.visible = interiorMode;
    document.getElementById('tb-interior').classList.toggle('active', interiorMode);

    if(interiorMode){
      deps.volcanoGroup.visible = false;
      deps.boundaryGroup.visible = false;
      deps.gridGroup.visible = false;
      deps.earthMat.uniforms.uClipInterior.value = 1.0;
      layerPanel.classList.add('show');
      deps.setActivePanel('interior');
    } else {
      deps.volcanoGroup.visible = true;
      deps.boundaryGroup.visible = true;
      deps.gridGroup.visible = true;
      deps.earthMat.uniforms.uClipInterior.value = 0.0;
      layerPanel.classList.remove('show');
      activeLayer = null;
      deps.setActivePanel(null);
      csMat.uniforms.uFocusMode.value = 0.0;
      layerPanel.querySelectorAll('.lp-btn').forEach(b=>b.classList.remove('active'));
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
    const kc=KC_DATA_INTERIOR[key];
    if(kc) deps.showKC(kc); else deps.hideKC();
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

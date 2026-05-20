import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const BOUNDARY_R = 1.003;

export async function init({ scene, TILT, resolution, allLineMats, lngLatToVec3 }, deps) {
  const splitParent = new THREE.Group();
  splitParent.rotation.x = TILT;
  splitParent.visible = false;
  scene.add(splitParent);
  const splitGroups = {};
  let splitInited = false, splitActive = false, splitProgress = 0, splitDir = 0;

  const SPLIT_INFO = await fetch('plates/split-data.json').then(r => r.json());

  function makeTextSprite(text, color){
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

  function initSplit(){
    if(splitInited) return;
    splitInited = true;
    for(const [name,info] of Object.entries(SPLIT_INFO)){
      const group = new THREE.Group();
      const color = new THREE.Color(info.color);
      if(info.polys){
        info.polys.forEach(seg => {
          if(seg.length < 2) return;
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

  function toggleSplit(){
    initSplit();
    splitActive = !splitActive;
    splitDir = splitActive ? 1 : -1;
    deps.splitBtn.classList.toggle('active', splitActive);
    deps.splitBtn.textContent = splitActive ? '🔄 合并板块' : '🔄 拆分板块';
    if(splitActive){
      splitParent.visible = true;
      deps.setAutoRotate(false);
      deps.setManualPause(true);
      document.getElementById('pause-btn').textContent = '▶';
      deps.clearPlateHighlight();
      deps.plates.highlightBtype = null;
      deps.plates.bGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
    }
  }

  function forceComplete(earthMat){
    splitProgress = 0;
    splitDir = 0;
    splitActive = false;
    splitParent.visible = false;
    if(deps.splitBtn){
      deps.splitBtn.classList.remove('active');
      deps.splitBtn.textContent = '🔄 拆分板块';
    }
    if(earthMat) earthMat.uniforms.uOpacity.value = 1;
    for(const g of Object.values(splitGroups)){
      g.position.set(0,0,0);
    }
  }

  function updateSplit(earthMat, boundaryGroup){
    if(splitDir === 0) return;
    splitProgress += splitDir * 0.018;
    splitProgress = Math.max(0, Math.min(1, splitProgress));
    const ease = splitProgress * splitProgress * (3 - 2 * splitProgress);
    for(const g of Object.values(splitGroups)){
      g.position.copy(g.userData.targetOffset.clone().multiplyScalar(ease));
    }
    earthMat.uniforms.uOpacity.value = 1 - ease * 0.6;
    if(splitDir === 1) boundaryGroup.visible = ease < 0.5;
    if(splitProgress <= 0 && splitDir === -1){
      splitDir = 0; splitParent.visible = false;
      earthMat.uniforms.uOpacity.value = 1;
      boundaryGroup.visible = true;
    }
    if(splitProgress >= 1) splitDir = 0;
  }

  return {
    splitParent,
    splitGroups,
    get splitActive(){ return splitActive; },
    get splitDir(){ return splitDir; },
    toggleSplit,
    updateSplit,
    forceComplete,
  };
}

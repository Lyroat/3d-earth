import * as THREE from 'three';

const VOLCANO_R = 1.025;
const CLUSTER_PX = 28;
const VCOLORS = {a:'#DC143C',d:'#FFA500',e:'#B0C4DE',u:'#555555'};
const STATUS_CN = {a:'活火山',d:'休眠火山',e:'死火山',u:'未知'};
const STATUS_EN = {a:'Active Volcano',d:'Dormant Volcano',e:'Extinct Volcano',u:'Unknown'};

const KC_DATA_VOLCANO = {
  'volcano-a':{title:'活火山',desc:'<p>主要指一万年以来活动过的火山。</p><div class="kc-subtitle">关键特征</div><ul><li>目前仍有岩浆活动迹象（喷发、气体释放、地热等）</li><li>喷发具有不确定性</li><li>常伴随地震、地面形变</li><li>对人类具有潜在威胁</li></ul>'},
  'volcano-d':{title:'休眠火山',desc:'<p>人类历史上喷发过，长期处在静止状态没有喷发，但在将来某个时候会喷发的活火山。</p><div class="kc-subtitle">关键特征</div><ul><li>当前处于"安静状态"</li><li>地下仍可能存在岩浆活动</li><li>喷发周期可能为数百年至数万年</li><li>判定难度较大（有一定不确定性）</li></ul>'},
  'volcano-e':{title:'死火山',desc:'<p>过去一万年没有喷发历史，并且将来一万年不期望喷发的火山。</p><div class="kc-subtitle">关键特征</div><ul><li>岩浆供给系统已经消失</li><li>长期无任何活动迹象</li><li>通常与板块运动环境改变有关</li><li>地貌上可能仍保留火山形态</li></ul>'}
};

export async function init({ scene, camera, renderer, TILT, lngLatToVec3 }, deps) {
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

  const V_DATA = await fetch('volcanoes/data.json').then(r => r.json());

  V_DATA.forEach(([lon,lat,name,nameCn,type,typeCn,sc,statusCn,statusEn,region,lastErupt,lastEruptCn]) => {
    vCounts[sc] = (vCounts[sc]||0) + 1;
    const sp = makeVSprite(VCOLORS[sc]||VCOLORS.u);
    sp.position.copy(lngLatToVec3(lon,lat,VOLCANO_R));
    sp.userData = {name,nameCn,type,typeCn,sc,statusCn,statusEn,region,lastErupt,lastEruptCn,lon,lat};
    volcanoGroup.add(sp); volcanoSprites.push(sp);
  });

  /* Volcano Filter */
  const vGrid = document.getElementById('volcano-grid');
  let activeVFilter = null;

  [{s:'a',c:'#DC143C',l:'活火山'},{s:'d',c:'#FFA500',l:'休眠火山'},{s:'e',c:'#B0C4DE',l:'死火山'}].forEach(o => {
    const btn=document.createElement('div');btn.className='chip';btn.dataset.status=o.s;
    btn.innerHTML=`<span class="cdot" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${o.l} <small>${vCounts[o.s]||0}</small>`;
    btn.addEventListener('click',e => {
      e.stopPropagation();
      if(activeVFilter===o.s){
        activeVFilter=null;
        vGrid.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
        volcanoSprites.forEach(sp=>{sp.visible=true;});
        deps.hideKC();
      } else {
        activeVFilter=o.s;
        vGrid.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.status===o.s));
        volcanoSprites.forEach(sp=>{sp.visible=(sp.userData.sc===o.s);});
        const kc=KC_DATA_VOLCANO['volcano-'+o.s];
        if(kc) deps.showKC(kc);
      }
    });
    vGrid.appendChild(btn);
  });

  /* Select / Deselect */
  let selectedVolcano = null;
  function selectVolcano(sp){
    selectedVolcano = sp;
    volcanoSprites.forEach(s=>{if(s!==sp) s.visible=false;});
    sp.visible = true;
  }
  function deselectVolcano(){
    if(!selectedVolcano) return;
    selectedVolcano = null;
    volcanoSprites.forEach(sp=>{
      sp.visible = activeVFilter ? (sp.userData.sc===activeVFilter) : true;
    });
  }

  /* Search */
  const searchInput = document.getElementById('volcano-search');
  const searchResults = document.getElementById('search-results');
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
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
          selectVolcano(sp);deps.zoomToVolcano(sp.userData);
        });
      });
    },150);
  });
  searchInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      const q=searchInput.value.trim().toLowerCase();
      if(!q) return;
      const sp=volcanoSprites.find(s=>{
        const d=s.userData;
        return d.name.toLowerCase()===q||d.nameCn===q||d.name.toLowerCase().includes(q)||d.nameCn.includes(q);
      });
      if(sp){searchResults.style.display='none';searchInput.value='';selectVolcano(sp);deps.zoomToVolcano(sp.userData);}
    }
    if(e.key==='Escape'){searchResults.style.display='none';searchInput.blur();}
  });
  searchInput.addEventListener('blur',()=>{setTimeout(()=>{searchResults.style.display='none';},200);});

  /* Tooltip / Cluster */
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line2 = {threshold:0.02};
  const mouse = new THREE.Vector2();

  function earthDist(rc){
    const h = rc.intersectObject(deps.earth);
    return h.length > 0 ? h[0].distance : Infinity;
  }
  function isVisible(sp){
    const wp = new THREE.Vector3();sp.getWorldPosition(wp);
    return wp.dot(camera.position) > 0;
  }

  const tooltipEl = document.getElementById('tooltip');
  const clusterEl = document.getElementById('cluster-popup');
  let clusterHovered = false;
  clusterEl.addEventListener('mouseenter',()=>{clusterHovered=true;});
  clusterEl.addEventListener('mouseleave',()=>{clusterHovered=false;setTimeout(()=>{if(!clusterHovered)clusterEl.style.display='none';},250);});

  function screenPos(sp){
    const v=sp.position.clone();v.applyMatrix4(volcanoGroup.matrixWorld);v.project(camera);
    return{x:(v.x+1)/2*innerWidth,y:(-v.y+1)/2*innerHeight,z:v.z};
  }

  function tipHTML(d){
    const dc=VCOLORS[d.sc]||VCOLORS.u;
    const nameLine = d.nameCn&&d.nameCn!==d.name
      ? `<div class="tip-name-cn">${d.nameCn}</div><div class="tip-name-en">${d.name}</div>`
      : `<div class="tip-name-cn">${d.name}</div>`;
    return `${nameLine}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">类型</span><span class="tip-val">${d.typeCn}（${d.type}）</span></div>
<div class="tip-row"><span class="tip-label">活跃度</span><span class="tip-val" style="color:${dc}">${d.statusCn}（${d.statusEn}）</span></div>
<div class="tip-row"><span class="tip-label">位置</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">上次喷发</span><span class="tip-val">${d.lastEruptCn||'未知'}</span></div>`;
  }
  function posEl(el,x,y){
    el.style.display='block';el.style.transform='';
    requestAnimationFrame(()=>{
      const r=el.getBoundingClientRect();let l=x+16,t=y-12;
      if(l+r.width>innerWidth-16)l=x-r.width-16;
      if(t+r.height>innerHeight-16)t=innerHeight-r.height-16;
      if(t<16)t=16;
      el.style.left=l+'px';el.style.top=t+'px';
    });
  }

  let clusterSprites=[];
  function buildCluster(sprites,mx,my){
    clusterSprites=sprites;const clusterData=sprites.map(s=>s.userData);
    let h=`<div class="cl-title">📍 区域内火山（${sprites.length}个）</div>`;
    clusterData.forEach((d,i)=>{const dc=VCOLORS[d.sc]||VCOLORS.u;
      const cn=d.nameCn&&d.nameCn!==d.name?d.nameCn+' ':'';
      h+=`<div class="cl-item" data-idx="${i}"><div class="cl-dot" style="background:${dc};box-shadow:0 0 3px ${dc}"></div><div><div class="cl-name">${cn}<small>${d.name}</small></div><div class="cl-sub">${d.typeCn} · ${d.statusCn}</div></div></div>`;
    });
    h+=`<div id="cl-detail"></div>`;
    clusterEl.innerHTML=h;posEl(clusterEl,mx,my);

    clusterEl.querySelectorAll('.cl-item').forEach(item=>{
      item.addEventListener('mouseenter',()=>{
        const d=clusterData[parseInt(item.dataset.idx)];if(!d)return;
        const det=document.getElementById('cl-detail');const dc=VCOLORS[d.sc]||VCOLORS.u;
        const nm=d.nameCn&&d.nameCn!==d.name?`<div class="tip-name-cn">${d.nameCn}</div><div class="tip-name-en">${d.name}</div>`:`<div class="tip-name-cn">${d.name}</div>`;
        det.innerHTML=`${nm}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">类型</span><span class="tip-val">${d.typeCn}（${d.type}）</span></div>
<div class="tip-row"><span class="tip-label">活跃度</span><span class="tip-val" style="color:${dc}">${d.statusCn}（${d.statusEn}）</span></div>
<div class="tip-row"><span class="tip-label">位置</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">上次喷发</span><span class="tip-val">${d.lastEruptCn||'未知'}</span></div>`;
      });
      item.addEventListener('click',()=>{
        const sp=clusterSprites[parseInt(item.dataset.idx)];if(!sp)return;
        clusterEl.style.display='none';clusterHovered=false;
        selectVolcano(sp);deps.zoomToVolcano(sp.userData);
      });
    });
  }

  function handlePointerMove(e){
    if(clusterHovered) return;
    const barEl=document.getElementById('bottom-bar');
    const barRect=barEl.getBoundingClientRect();
    const overBar=e.clientY>=barRect.top;
    const overPanel=document.querySelector('.side-panel.show');
    const inPanel=overPanel&&e.clientX<=overPanel.getBoundingClientRect().right&&e.clientY>=overPanel.getBoundingClientRect().top&&e.clientY<=overPanel.getBoundingClientRect().bottom;
    if(deps.getSplitActive()||overBar||inPanel){tooltipEl.style.display='none';clusterEl.style.display='none';document.body.style.cursor='default';return;}
    mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;
    raycaster.setFromCamera(mouse,camera);
    if(deps.interiorHover(raycaster,e.clientX,e.clientY)){clusterEl.style.display='none';return;}
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
    if(deps.boundaryGroup.visible){
      let closest=null,cDist=Infinity;
      for(const line of deps.bPairs.map(p=>p.main)){
        if(!line.visible) continue;
        const ints=raycaster.intersectObject(line);
        if(ints.length&&ints[0].distance<eDist+0.01&&ints[0].distance<cDist){cDist=ints[0].distance;closest=line;}
      }
      if(closest){tooltipEl.textContent=closest.userData.label;posEl(tooltipEl,e.clientX,e.clientY);document.body.style.cursor='pointer';return;}
    }
    tooltipEl.style.display='none';document.body.style.cursor='default';
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);

  /* Click: select volcano or deselect */
  renderer.domElement.addEventListener('click',e=>{
    if(deps.getSplitActive()||deps.getInteriorMode()) return;
    if(!volcanoGroup.visible){if(selectedVolcano)deselectVolcano();return;}
    const mx=(e.clientX/innerWidth)*2-1,my=-(e.clientY/innerHeight)*2+1;
    const rc=new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx,my),camera);
    const eDist2=earthDist(rc);
    const vis=volcanoSprites.filter(s=>s.visible&&isVisible(s));
    const hits=rc.intersectObjects(vis).filter(h=>h.distance<eDist2+0.01&&isVisible(h.object));
    if(hits.length>0){
      selectVolcano(hits[0].object);deps.zoomToVolcano(hits[0].object.userData);
    } else if(selectedVolcano){
      deselectVolcano();
    }
  });

  /* Escape key */
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      deselectVolcano();deps.restoreView();
      tooltipEl.style.display='none';clusterEl.style.display='none';
      document.getElementById('search-results').style.display='none';
    }
  });

  /* Pulse update (called from animate) */
  function updatePulse(t){
    volcanoSprites.forEach((sp,i)=>{if(sp.visible) sp.material.opacity=0.72+0.28*Math.sin(t*2.5+i*0.6);});
  }

  return {
    volcanoGroup,
    volcanoSprites,
    selectedVolcano: () => selectedVolcano,
    deselectVolcano,
    selectVolcano,
    updatePulse,
    tooltipEl,
    clusterEl,
  };
}

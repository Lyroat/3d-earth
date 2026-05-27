import * as THREE from 'three';
import { getPhotosForVolcano, getPhotoUrl } from '../../photos/photos.js';
import { t, getLang } from '../../i18n/lang.js';

const VOLCANO_R = 1.025; // 火山标记离地表高度（1=贴地表，越大越高）
const CLUSTER_PX = 28; // 火山聚合判定像素半径（屏幕距离内的火山会合并为一组）
const VCOLORS = {a:'#DC143C',d:'#FFA500',e:'#B0C4DE',u:'#555555'}; // 火山类型颜色：a=活火山(深红)、d=休眠(橙)、e=死火山(银灰)
function getStatusLabel(sc) {
  const map = {a:'v.active',d:'v.dormant',e:'v.extinct',u:'v.unknown'};
  return t(map[sc] || 'v.unknown');
}

function getKcVolcano(key) {
  return { title: t('kc.' + key + '.title'), desc: t('kc.' + key + '.desc') };
}

export async function init({ scene, camera, renderer, TILT, lngLatToVec3 }, deps) {
  function makeVSprite(color){
    const cv=document.createElement('canvas');cv.width=128;cv.height=128;
    const x=cv.getContext('2d'),cx=64,cy=64;
    const g=x.createRadialGradient(cx,cy,0,cx,cy,56);
    g.addColorStop(0,color);g.addColorStop(0.35,color+'aa');g.addColorStop(1,color+'00'); // 火山标记径向渐变（中心亮，外围淡出）
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,56,0,Math.PI*2);x.fill();
    x.fillStyle='#fff';x.beginPath();x.arc(cx,cy,8,0,Math.PI*2);x.fill(); // 火山中心白色圆点大小（8像素）
    const t=new THREE.CanvasTexture(cv);
    const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,sizeAttenuation:true});
    const s=new THREE.Sprite(m);s.scale.set(0.08,0.08,1);return s; // 火山标记在3D空间中的大小
  }

  const volcanoGroup = new THREE.Group();
  volcanoGroup.rotation.x = TILT;
  scene.add(volcanoGroup);
  const volcanoSprites = [];
  const vCounts = {a:0,d:0,e:0,u:0};

  const V_DATA = await fetch('earth_function/volcanoes/data.json').then(r => r.json());

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

  [{s:'a',c:'#DC143C',lk:'v.active'},{s:'d',c:'#FFA500',lk:'v.dormant'},{s:'e',c:'#B0C4DE',lk:'v.extinct'}].forEach(o => {
    const btn=document.createElement('div');btn.className='chip';btn.dataset.status=o.s;
    btn.innerHTML=`<span class="cdot" style="background:${o.c};box-shadow:0 0 4px ${o.c}"></span>${t(o.lk)} <small>${vCounts[o.s]||0}</small>`;
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
        deps.showKC(getKcVolcano('volcano-'+o.s));
      }
    });
    vGrid.appendChild(btn);
  });

  /* Select / Deselect */
  const uploadTrigger = document.getElementById('upload-trigger');
  const lightboxEl = document.getElementById('photo-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  let selectedVolcano = null;
  let pinnedSprite = null;
  function selectVolcano(sp){
    selectedVolcano = sp;
    volcanoSprites.forEach(s=>{if(s!==sp) s.visible=false;});
    sp.visible = true;
    uploadTrigger.style.display = 'block';
    uploadTrigger.dataset.volcanoId = sp.userData.name;
    uploadTrigger.dataset.volcanoName = sp.userData.nameCn || sp.userData.name;
  }
  let pinnedPhotoIdx = 0;

  function pinTooltip(sp){
    pinnedSprite = sp;
    pinnedPhotoIdx = 0;
    const d = sp.userData;
    const photos = getPhotosForVolcano(d.name);
    tooltipEl.innerHTML = tipHTML(d);
    tooltipEl.style.whiteSpace = photos.length > 0 ? 'normal' : 'nowrap';
    tooltipEl.style.maxWidth = photos.length > 0 ? '280px' : '';
    tooltipEl.classList.add('pinned');
    tooltipEl.style.display = 'block';
    bindPhotoEvents(photos);
  }

  function bindPhotoEvents(photos) {
    const photoImg = tooltipEl.querySelector('.tip-photo img');
    if (photoImg) {
      photoImg.addEventListener('click', () => {
        lightboxImg.src = photoImg.src;
        lightboxEl.classList.add('show');
      });
    }
    if (photos.length > 1) {
      tooltipEl.querySelectorAll('.tip-nav-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const dir = parseInt(btn.dataset.dir);
          pinnedPhotoIdx = (pinnedPhotoIdx + dir + photos.length) % photos.length;
          const photoEl = tooltipEl.querySelector('.tip-photo');
          const nav = photoEl.querySelector('.tip-photo-nav');
          const p = photos[pinnedPhotoIdx];
          photoEl.innerHTML = photoSlideHTML(p) + nav.outerHTML;
          photoEl.querySelector('.tip-nav-idx').textContent = `${pinnedPhotoIdx + 1} / ${photos.length}`;
          bindPhotoEvents(photos);
        });
      });
    }
  }
  function unpinTooltip(){
    pinnedSprite = null;
    tooltipEl.classList.remove('pinned');
    tooltipEl.style.display = 'none';
  }
  function updatePinned(){
    if (!pinnedSprite) return;
    const p = screenPos(pinnedSprite);
    if (p.z > 1) { tooltipEl.style.display = 'none'; return; }
    tooltipEl.style.display = 'block';
    posEl(tooltipEl, p.x, p.y);
  }

  function deselectVolcano(){
    if(!selectedVolcano) return;
    selectedVolcano = null;
    unpinTooltip();
    volcanoSprites.forEach(sp=>{
      sp.visible = activeVFilter ? (sp.userData.sc===activeVFilter) : true;
    });
    uploadTrigger.style.display = 'none';
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
      if(matches.length===0){searchResults.innerHTML=`<div class="sr-item" style="color:rgba(255,255,255,.4)">${t('v.noMatch')}</div>`;searchResults.style.display='block';return;}
      searchResults.innerHTML=matches.map((sp,i)=>{
        const d=sp.userData;const dc=VCOLORS[d.sc]||VCOLORS.u;
        return `<div class="sr-item" data-sidx="${i}"><span class="sr-name"><span style="color:${dc}">●</span> ${d.nameCn!==d.name?d.nameCn+' ':''}<small>${d.name}</small></span><span class="sr-sub">${d.statusCn}</span></div>`;
      }).join('');
      searchResults.style.display='block';
      searchResults.querySelectorAll('.sr-item').forEach((el,i)=>{
        el.addEventListener('click',()=>{
          const sp=matches[i];if(!sp)return;
          searchResults.style.display='none';searchInput.value='';
          selectVolcano(sp);pinTooltip(sp);deps.zoomToVolcano(sp.userData);
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

  function photoSlideHTML(p) {
    const descLine = p.description ? `<div class="tip-desc">${p.description}</div>` : '';
    const datePart = p.taken_date ? ` · ${p.taken_date}` : '';
    return `<img src="${getPhotoUrl(p.image_path)}" />${descLine}<div class="tip-credit">📷 ${p.uploader_id}${datePart} · CC BY 4.0</div>`;
  }

  function tipHTML(d){
    const dc=VCOLORS[d.sc]||VCOLORS.u;
    const isZh = getLang() === 'zh';
    const nameLine = d.nameCn&&d.nameCn!==d.name
      ? (isZh ? `<div class="tip-name-cn">${d.nameCn}</div><div class="tip-name-en">${d.name}</div>` : `<div class="tip-name-cn">${d.name}</div><div class="tip-name-en">${d.nameCn}</div>`)
      : `<div class="tip-name-cn">${d.name}</div>`;
    const photos = getPhotosForVolcano(d.name);
    let photoHtml = '';
    if (photos.length > 0) {
      const nav = photos.length > 1
        ? `<div class="tip-photo-nav"><button class="tip-nav-btn" data-dir="-1">‹</button><span class="tip-nav-idx">1 / ${photos.length}</span><button class="tip-nav-btn" data-dir="1">›</button></div>`
        : '';
      photoHtml = `<div class="tip-photo" data-total="${photos.length}">${photoSlideHTML(photos[0])}${nav}</div>`;
    }
    const typeTxt = isZh ? `${d.typeCn}（${d.type}）` : `${d.type}`;
    const statusTxt = isZh ? `${d.statusCn}（${d.statusEn}）` : `${d.statusEn}`;
    const eruptTxt = isZh ? (d.lastEruptCn||t('v.unknown')) : (d.lastErupt||t('v.unknown'));
    return `${nameLine}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">${t('v.type')}</span><span class="tip-val">${typeTxt}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.activity')}</span><span class="tip-val" style="color:${dc}">${statusTxt}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.location')}</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.lastEruption')}</span><span class="tip-val">${eruptTxt}</span></div>${photoHtml}`;
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
    let h=`<div class="cl-title">${t('v.clusterTitle').replace('{n}',sprites.length)}</div>`;
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
        const isZh = getLang() === 'zh';
        const typeTxt = isZh ? `${d.typeCn}（${d.type}）` : `${d.type}`;
        const statusTxt = isZh ? `${d.statusCn}（${d.statusEn}）` : `${d.statusEn}`;
        const eruptTxt = isZh ? (d.lastEruptCn||t('v.unknown')) : (d.lastErupt||t('v.unknown'));
        det.innerHTML=`${nm}<div class="tip-sep"></div>
<div class="tip-row"><span class="tip-label">${t('v.type')}</span><span class="tip-val">${typeTxt}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.activity')}</span><span class="tip-val" style="color:${dc}">${statusTxt}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.location')}</span><span class="tip-val">${d.region}</span></div>
<div class="tip-row"><span class="tip-label">${t('v.lastEruption')}</span><span class="tip-val">${eruptTxt}</span></div>`;
      });
      item.addEventListener('click',()=>{
        const sp=clusterSprites[parseInt(item.dataset.idx)];if(!sp)return;
        clusterEl.style.display='none';clusterHovered=false;
        selectVolcano(sp);pinTooltip(sp);deps.zoomToVolcano(sp.userData);
      });
    });
  }

  function handlePointerMove(e){
    if(clusterHovered || pinnedSprite) return;
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
        const nearby=[];vis.forEach(sp=>{const p=screenPos(sp);if(p.z>1)return;const dx=p.x-mx,dy=p.y-my;if(Math.sqrt(dx*dx+dy*dy)<CLUSTER_PX)nearby.push(sp);}); // 聚合检测：屏幕像素距离<CLUSTER_PX的火山归为一组
        if(nearby.length>1){tooltipEl.style.display='none';buildCluster(nearby,mx,my);document.body.style.cursor='pointer';return;}
        clusterEl.style.display='none';
        const _d=vHits[0].object.userData;const _ph=getPhotosForVolcano(_d.name);
        tooltipEl.innerHTML=tipHTML(_d);
        tooltipEl.style.whiteSpace=_ph.length>0?'normal':'nowrap';
        tooltipEl.style.maxWidth=_ph.length>0?'280px':'';
        posEl(tooltipEl,mx,my);document.body.style.cursor='pointer';return;
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
      const sp = hits[0].object;
      selectVolcano(sp);
      pinTooltip(sp);
      deps.zoomToVolcano(sp.userData);
    } else if(selectedVolcano){
      deselectVolcano();
    }
  });

  /* Escape key */
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if (lightboxEl.classList.contains('show')) {
        lightboxEl.classList.remove('show');
        return;
      }
      deselectVolcano();deps.restoreView();
      tooltipEl.style.display='none';clusterEl.style.display='none';
      document.getElementById('search-results').style.display='none';
    }
  });

  /* Lightbox close */
  lightboxEl.addEventListener('click', e => {
    if (e.target === lightboxEl || e.target.id === 'lightbox-close') {
      lightboxEl.classList.remove('show');
    }
  });

  /* Pulse update (called from animate) */
  function updatePulse(t){
    volcanoSprites.forEach((sp,i)=>{if(sp.visible) sp.material.opacity=0.72+0.28*Math.sin(t*2.5+i*0.6);}); // 火山闪烁动画：基础亮度0.72，闪烁幅度0.28，频率2.5，相位偏移0.6
  }

  return {
    volcanoGroup,
    volcanoSprites,
    selectedVolcano: () => selectedVolcano,
    deselectVolcano,
    selectVolcano,
    updatePulse,
    updatePinned,
    tooltipEl,
    clusterEl,
  };
}

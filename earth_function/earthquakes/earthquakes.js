import * as THREE from 'three';
import { t, getLang } from '../../i18n/lang.js';

const EARTHQUAKE_R = 1.022;

const CATEGORIES = [
  { key: 'micro',    min: 0,   max: 2.99,  color: '#66BB6A', lk: 'eq.micro',    timeRange: 'month3', trLk: 'eq.timeRange.month3' },
  { key: 'light',    min: 3,   max: 4.49,  color: '#CDDC39', lk: 'eq.light',    timeRange: 'year1',  trLk: 'eq.timeRange.year1' },
  { key: 'moderate', min: 4.5, max: 5.99,  color: '#FF9800', lk: 'eq.moderate', timeRange: 'year5',  trLk: 'eq.timeRange.year5' },
  { key: 'strong',   min: 6,   max: 6.99,  color: '#F44336', lk: 'eq.strong',   timeRange: 'year20', trLk: 'eq.timeRange.year20' },
  { key: 'major',    min: 7,   max: 10,    color: '#B71C1C', lk: 'eq.major',    timeRange: 'all',    trLk: 'eq.timeRange.all' },
];

function lerpColor(c1, c2, f) {
  const h = s => parseInt(s.slice(1), 16);
  const a = h(c1), b = h(c2);
  const r = Math.round(((a >> 16) & 0xff) * (1 - f) + ((b >> 16) & 0xff) * f);
  const g = Math.round(((a >> 8) & 0xff) * (1 - f) + ((b >> 8) & 0xff) * f);
  const bl = Math.round((a & 0xff) * (1 - f) + (b & 0xff) * f);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

function magToColor(mag) {
  if (mag < 3)   return lerpColor('#4CAF50', '#CDDC39', Math.max(0, mag) / 3);
  if (mag < 4.5) return lerpColor('#CDDC39', '#FF9800', (mag - 3) / 1.5);
  if (mag < 6)   return lerpColor('#FF9800', '#F44336', (mag - 4.5) / 1.5);
  if (mag < 7)   return lerpColor('#F44336', '#B71C1C', (mag - 6));
  return lerpColor('#B71C1C', '#880000', Math.min((mag - 7) / 2, 1));
}

function magToSize(mag) {
  const t = Math.min(Math.max((mag - 1) / 8, 0), 1);
  return 0.012 + t * t * 0.07;
}

const texCache = new Map();
function makeTexture(color) {
  if (texCache.has(color)) return texCache.get(color);
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = color;
  x.beginPath();
  x.arc(32, 32, 27, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = 1.5;
  x.stroke();
  const tex = new THREE.CanvasTexture(cv);
  texCache.set(color, tex);
  return tex;
}

function offsetYears(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

function buildURL(cat, customStart, customEnd) {
  const base = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson';
  let start, end;
  if (customStart && customEnd) {
    start = `${customStart}-01-01`;
    end = `${customEnd}-12-31`;
  } else {
    end = new Date().toISOString().split('T')[0];
    switch (cat.timeRange) {
      case 'month3': start = offsetYears(0.25); break;
      case 'month6': start = offsetYears(0.5); break;
      case 'year1':  start = offsetYears(1); break;
      case 'year5':  start = offsetYears(5); break;
      case 'year10': start = offsetYears(10); break;
      case 'year20': start = offsetYears(20); break;
      case 'all':    start = '1900-01-01'; break;
    }
  }
  return `${base}&starttime=${start}&endtime=${end}&minmagnitude=${cat.min}&maxmagnitude=${cat.max}&orderby=magnitude&limit=20000`;
}

const cache = new Map();
async function fetchCategory(cat, customStart, customEnd) {
  const cacheKey = `${cat.key}_${customStart || ''}_${customEnd || ''}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const resp = await fetch(buildURL(cat, customStart, customEnd));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  cache.set(cacheKey, json.features);
  return json.features;
}

export async function init({ scene, camera, renderer, TILT, lngLatToVec3 }, deps) {
  const earthquakeGroup = new THREE.Group();
  earthquakeGroup.rotation.x = TILT;
  earthquakeGroup.visible = false;
  scene.add(earthquakeGroup);

  let earthquakeSprites = [];
  let activeFilter = null;
  const tooltipEl = document.getElementById('tooltip');
  const loadingEl = document.getElementById('eq-loading');
  const hintEl = document.getElementById('eq-time-hint');
  const yearStartEl = document.getElementById('eq-year-start');
  const yearEndEl = document.getElementById('eq-year-end');

  function getCustomYears() {
    const s = parseInt(yearStartEl.value);
    const e = parseInt(yearEndEl.value);
    if (s && e && s >= 1900 && e >= s) return [s, e];
    return null;
  }

  function onYearChange() {
    if (activeFilter || earthquakeSprites.length > 0) {
      clearMarkers();
      activeFilter = null;
      grid.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      hintEl.textContent = '';
    }
  }
  yearStartEl.addEventListener('change', onYearChange);
  yearEndEl.addEventListener('change', onYearChange);

  function clearMarkers() {
    earthquakeSprites.forEach(sp => {
      sp.material.dispose();
      earthquakeGroup.remove(sp);
    });
    earthquakeSprites = [];
  }

  function renderFeatures(features) {
    clearMarkers();
    features.forEach(f => {
      const [lon, lat, depthKm] = f.geometry.coordinates;
      const mag = f.properties.mag;
      if (mag == null || lat == null || lon == null) return;
      const color = magToColor(mag);
      const size = magToSize(mag);
      const tex = makeTexture(color);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.9 });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(size, size, 1);
      sp.position.copy(lngLatToVec3(lon, lat, EARTHQUAKE_R));
      sp.userData = { mag, lon, lat, depth: depthKm, place: f.properties.place, time: f.properties.time, baseScale: size };
      earthquakeGroup.add(sp);
      earthquakeSprites.push(sp);
    });
  }

  /* ── Filter Chips ── */
  const grid = document.getElementById('earthquake-grid');

  CATEGORIES.forEach(cat => {
    const btn = document.createElement('div');
    btn.className = 'chip';
    btn.dataset.key = cat.key;
    const dot = `<span class="cdot" style="background:${cat.color};box-shadow:0 0 4px ${cat.color}"></span>`;
    btn.innerHTML = `${dot}<span data-i18n="${cat.lk}">${t(cat.lk)}</span>`;
    btn.addEventListener('click', () => handleChipClick(cat, btn));
    grid.appendChild(btn);
  });

  async function handleChipClick(cat, btn) {
    if (activeFilter === cat.key) {
      activeFilter = null;
      btn.classList.remove('active');
      clearMarkers();
      hintEl.textContent = '';
      return;
    }
    grid.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    activeFilter = cat.key;
    btn.classList.add('active');
    loadingEl.style.display = 'flex';
    hintEl.textContent = '';
    const years = getCustomYears();
    try {
      const features = await fetchCategory(cat, years ? years[0] : null, years ? years[1] : null);
      if (activeFilter !== cat.key) return;
      renderFeatures(features);
      earthquakeGroup.visible = true;
      document.getElementById('ep-show-earthquake').classList.add('active');
      const countText = t('eq.count').replace('{n}', features.length);
      const rangeText = years ? `${years[0]}–${years[1]}` : t(cat.trLk);
      hintEl.textContent = `${rangeText} · ${countText}`;
    } catch (e) {
      if (activeFilter === cat.key) hintEl.textContent = t('eq.loadFail');
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  /* ── Tooltip ── */
  function eqTipHTML(d) {
    const isZh = getLang() === 'zh';
    const date = new Date(d.time);
    const dateStr = date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(isZh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    return `<div class="tip-name-cn">${d.place || 'Unknown'}</div>`
      + `<div class="tip-sep"></div>`
      + `<div class="tip-row"><span class="tip-label">${t('eq.magnitude')}</span><span class="tip-val" style="color:${magToColor(d.mag)}">M ${d.mag.toFixed(1)}</span></div>`
      + `<div class="tip-row"><span class="tip-label">${t('eq.depth')}</span><span class="tip-val">${d.depth != null ? d.depth.toFixed(1) : '?'} ${t('eq.depthUnit')}</span></div>`
      + `<div class="tip-row"><span class="tip-label">${t('eq.time')}</span><span class="tip-val">${dateStr} ${timeStr}</span></div>`;
  }

  function posEl(el, x, y) {
    const pad = 16;
    let left = x + pad, top = y + pad;
    const r = el.getBoundingClientRect();
    if (left + r.width > innerWidth) left = x - r.width - pad;
    if (top + r.height > innerHeight) top = y - r.height - pad;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function isVisible(sp) {
    const wp = new THREE.Vector3();
    sp.getWorldPosition(wp);
    return wp.dot(camera.position) > 0;
  }

  /* ── Hover Interaction ── */
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function earthDist(rc) {
    const hits = rc.intersectObject(deps.earth);
    return hits.length > 0 ? hits[0].distance : Infinity;
  }

  function earthquakeHover(rc, x, y) {
    if (!earthquakeGroup.visible || earthquakeSprites.length === 0) return false;
    const eDist = earthDist(rc);
    const vis = earthquakeSprites.filter(s => s.visible && isVisible(s));
    const hits = rc.intersectObjects(vis).filter(h => h.distance < eDist + 0.01);
    if (hits.length > 0) {
      const d = hits[0].object.userData;
      tooltipEl.innerHTML = eqTipHTML(d);
      tooltipEl.style.display = 'block';
      tooltipEl.style.whiteSpace = 'nowrap';
      tooltipEl.style.maxWidth = '';
      posEl(tooltipEl, x, y);
      return true;
    }
    return false;
  }

  /* ── Pulse Animation ── */
  function updatePulse(t) {
    if (!earthquakeGroup.visible) return;
    for (let i = 0; i < earthquakeSprites.length; i++) {
      const sp = earthquakeSprites[i];
      if (!sp.visible) continue;
      const base = sp.userData.baseScale;
      const pulse = 1 + 0.08 * Math.sin(t * 3 + i * 0.4);
      sp.scale.set(base * pulse, base * pulse, 1);
    }
  }

  /* ── Language change ── */
  window.addEventListener('langchange', () => {
    grid.querySelectorAll('.chip').forEach((btn, i) => {
      const cat = CATEGORIES[i];
      const dot = `<span class="cdot" style="background:${cat.color};box-shadow:0 0 4px ${cat.color}"></span>`;
      btn.innerHTML = `${dot}<span>${t(cat.lk)}</span>`;
    });
    if (activeFilter) {
      const cat = CATEGORIES.find(c => c.key === activeFilter);
      if (cat) {
        const countText = t('eq.count').replace('{n}', earthquakeSprites.length);
        hintEl.textContent = `${t(cat.trLk)} · ${countText}`;
      }
    }
  });

  async function loadDefault() {
    if (earthquakeSprites.length > 0 && !getCustomYears()) return;
    loadingEl.style.display = 'flex';
    const years = getCustomYears();
    try {
      const allFeatures = [];
      for (const cat of CATEGORIES) {
        const features = await fetchCategory(cat, years ? years[0] : null, years ? years[1] : null);
        allFeatures.push(...features);
      }
      renderFeatures(allFeatures);
      const countText = t('eq.count').replace('{n}', allFeatures.length);
      const rangeText = years ? `${years[0]}–${years[1]}` : '';
      hintEl.textContent = rangeText ? `${rangeText} · ${countText}` : countText;
    } catch (e) {
      hintEl.textContent = t('eq.loadFail');
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  return { earthquakeGroup, updatePulse, clearMarkers, loadDefault, earthquakeHover };
}
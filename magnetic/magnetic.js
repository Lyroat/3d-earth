import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

/* ================================================================
   IGRF-14 (epoch 2025.0) Gauss coefficients, l_max = 6
   Units: nT.  Source: planetMagFields / IGRF-14 data.
   Using Schmidt semi-normalized convention (no Condon-Shortley phase
   in the Legendre functions; the IGRF data already absorbs it).
   ================================================================ */
const LMAX = 6;
const _i = (l, m) => (l * (l + 1)) / 2 + m;
const NC = _i(LMAX, LMAX) + 1;
const G = new Float64Array(NC);
const H = new Float64Array(NC);

G[_i(1,0)]=-29350.0; G[_i(1,1)]=-1410.3;
G[_i(2,0)]=-2556.2;  G[_i(2,1)]=2950.9;  G[_i(2,2)]=1648.7;
G[_i(3,0)]=1360.9;   G[_i(3,1)]=-2404.2; G[_i(3,2)]=1243.8; G[_i(3,3)]=453.4;
G[_i(4,0)]=894.7;    G[_i(4,1)]=799.6;   G[_i(4,2)]=55.8;   G[_i(4,3)]=-281.1; G[_i(4,4)]=12.0;
G[_i(5,0)]=-232.9;   G[_i(5,1)]=369.0;   G[_i(5,2)]=187.2;  G[_i(5,3)]=-138.7; G[_i(5,4)]=-141.9; G[_i(5,5)]=20.9;
G[_i(6,0)]=64.3;     G[_i(6,1)]=63.8;    G[_i(6,2)]=76.7;   G[_i(6,3)]=-115.7; G[_i(6,4)]=-40.9;  G[_i(6,5)]=14.9; G[_i(6,6)]=-60.8;

H[_i(1,1)]=4545.5;
H[_i(2,1)]=-3133.6; H[_i(2,2)]=-814.2;
H[_i(3,1)]=-56.9;   H[_i(3,2)]=237.6;  H[_i(3,3)]=-549.6;
H[_i(4,1)]=278.6;   H[_i(4,2)]=-134.0; H[_i(4,3)]=212.0;  H[_i(4,4)]=-375.4;
H[_i(5,1)]=45.3;    H[_i(5,2)]=220.0;  H[_i(5,3)]=-122.9; H[_i(5,4)]=42.9;   H[_i(5,5)]=106.2;
H[_i(6,1)]=-18.4;   H[_i(6,2)]=16.8;   H[_i(6,3)]=48.9;   H[_i(6,4)]=-59.8;  H[_i(6,5)]=10.9;  H[_i(6,6)]=72.8;

/* ================================================================
   Schmidt Semi-Normalized Associated Legendre Functions
   Two-term recursion with simultaneous θ-derivative.
   ================================================================ */
const _P  = [];
const _dP = [];
for (let l = 0; l <= LMAX; l++) {
  _P[l]  = new Float64Array(l + 1);
  _dP[l] = new Float64Array(l + 1);
}

function computeALF(ct, st) {
  _P[0][0] = 1;  _dP[0][0] = 0;
  _P[1][0] = ct; _dP[1][0] = -st;
  _P[1][1] = st; _dP[1][1] = ct;
  for (let l = 2; l <= LMAX; l++) {
    const f1 = Math.sqrt((2*l - 1) / (2*l));
    _P[l][l]  = f1 * st * _P[l-1][l-1];
    _dP[l][l] = f1 * (ct * _P[l-1][l-1] + st * _dP[l-1][l-1]);
    const f2 = Math.sqrt(2*l - 1);
    _P[l][l-1]  = f2 * ct * _P[l-1][l-1];
    _dP[l][l-1] = f2 * (-st * _P[l-1][l-1] + ct * _dP[l-1][l-1]);
    for (let m = l - 2; m >= 0; m--) {
      const a = Math.sqrt(l*l - m*m);
      const b = Math.sqrt((l-1)*(l-1) - m*m);
      _P[l][m]  = ((2*l-1) * ct * _P[l-1][m]  - b * _P[l-2][m])  / a;
      _dP[l][m] = ((2*l-1) * (-st * _P[l-1][m] + ct * _dP[l-1][m]) - b * _dP[l-2][m]) / a;
    }
  }
}

/* ================================================================
   Magnetic Field (Br, Bθ, Bφ) at arbitrary (r, θ, φ)
   r in Earth-radii, θ = colatitude, φ = east-longitude (radians).
   ================================================================ */
const _cm = new Float64Array(LMAX + 1);
const _sm = new Float64Array(LMAX + 1);

function computeB(r, theta, phi) {
  const ct = Math.cos(theta), st = Math.sin(theta);
  computeALF(ct, st);

  const cp = Math.cos(phi), sp = Math.sin(phi);
  _cm[0] = 1; _sm[0] = 0;
  for (let m = 1; m <= LMAX; m++) {
    _cm[m] = _cm[m-1]*cp - _sm[m-1]*sp;
    _sm[m] = _sm[m-1]*cp + _cm[m-1]*sp;
  }

  let Br = 0, Bt = 0, BpS = 0;
  let rn = 1 / (r * r * r);
  for (let l = 1; l <= LMAX; l++) {
    for (let m = 0; m <= l; m++) {
      const k = _i(l, m);
      const ghc = G[k]*_cm[m] + H[k]*_sm[m];
      Br  += (l+1) * rn * ghc * _P[l][m];
      Bt  -= rn * ghc * _dP[l][m];
      if (m > 0) BpS += rn * m * (G[k]*_sm[m] - H[k]*_cm[m]) * _P[l][m];
    }
    rn /= r;
  }
  const Bp = Math.abs(st) > 1e-10 ? BpS / st : 0;
  return { Br, Bt, Bp };
}

/* ================================================================
   Coordinate helpers   (IGRF spherical ↔ Three.js Cartesian)
   Three.js convention matching lngLatToVec3 in earth.js:
     x =  r·sinθ·cosφ      (prime meridian on +x)
     y =  r·cosθ            (north pole on +y)
     z = -r·sinθ·sinφ       (east → −z)
   ================================================================ */
function sph2xyz(r, th, ph) {
  const st = Math.sin(th), ct = Math.cos(th);
  const sp = Math.sin(ph), cp = Math.cos(ph);
  return [r*st*cp, r*ct, -r*st*sp];
}

function xyz2sph(x, y, z) {
  const r = Math.sqrt(x*x + y*y + z*z);
  if (r < 1e-15) return [0, 0, 0];
  return [r, Math.acos(Math.min(1, Math.max(-1, y/r))), Math.atan2(-z, x)];
}

function bSph2xyz(Br, Bt, Bp, ct, st, cp, sp) {
  return [
    Br*st*cp + Bt*ct*cp - Bp*sp,
    Br*ct    - Bt*st,
    -(Br*st*sp + Bt*ct*sp) - Bp*cp
  ];
}

/* ================================================================
   Evaluate normalised B direction at a Cartesian point.
   sign = +1 traces along B, −1 traces against B.
   ================================================================ */
function evalBDir(x, y, z, sign) {
  const [r, th, ph] = xyz2sph(x, y, z);
  if (r < 0.5) return [0, 0, 0];
  const { Br, Bt, Bp } = computeB(r, th, ph);
  const ct = Math.cos(th), st = Math.sin(th);
  const cp = Math.cos(ph), sp = Math.sin(ph);
  const [bx, by, bz] = bSph2xyz(Br, Bt, Bp, ct, st, cp, sp);
  const mag = Math.sqrt(bx*bx + by*by + bz*bz);
  if (mag < 1e-20) return [0, 0, 0];
  const s = sign / mag;
  return [bx*s, by*s, bz*s];
}

/* ================================================================
   RK-4 Field-line integrator
   Returns flat [x,y,z, …] array of positions.
   ================================================================ */
const RMIN_STOP = 0.10;

function traceFieldLine(x0, y0, z0, sign, ds, maxSteps, rMax) {
  const pts = [];
  let x = x0, y = y0, z = z0;
  for (let i = 0; i < maxSteps; i++) {
    const r2 = x*x + y*y + z*z;
    if (r2 > rMax*rMax) break;
    if (r2 < RMIN_STOP*RMIN_STOP && i > 10) break;
    pts.push(x, y, z);

    const [k1x,k1y,k1z] = evalBDir(x, y, z, sign);
    if (k1x===0 && k1y===0 && k1z===0) break;
    const [k2x,k2y,k2z] = evalBDir(x+.5*ds*k1x, y+.5*ds*k1y, z+.5*ds*k1z, sign);
    const [k3x,k3y,k3z] = evalBDir(x+.5*ds*k2x, y+.5*ds*k2y, z+.5*ds*k2z, sign);
    const [k4x,k4y,k4z] = evalBDir(x+ds*k3x, y+ds*k3y, z+ds*k3z, sign);

    x += ds/6 * (k1x + 2*k2x + 2*k3x + k4x);
    y += ds/6 * (k1y + 2*k2y + 2*k3y + k4y);
    z += ds/6 * (k1z + 2*k2z + 2*k3z + k4z);
  }
  return pts;
}

/* ================================================================
   Public init
   ================================================================ */
export function init({ scene, TILT, resolution, allLineMats }) {
  const magneticGroup = new THREE.Group();
  magneticGroup.visible = false;
  scene.add(magneticGroup);
  magneticGroup.rotation.x = TILT;

  /* ---- colour helpers: north=blue, south=red/orange, per-vertex blend ---- */
  const colNorth = [0.22, 0.55, 1.0];
  const colSouth = [1.0, 0.62, 0.12];

  function vertexColor(x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z);
    const lat = y / (r || 1);
    const tN = (lat + 1) * 0.5;
    const dim = 0.55 + 0.45 * Math.exp(-0.12 * (r - 1));
    return [
      (colNorth[0]*tN + colSouth[0]*(1-tN)) * dim,
      (colNorth[1]*tN + colSouth[1]*(1-tN)) * dim,
      (colNorth[2]*tN + colSouth[2]*(1-tN)) * dim
    ];
  }

  /* ---- seed configurations ---- */
  const seeds = [
    { colat: 78, nAz: 16, w: 3.5,  op: 0.55 },
    { colat: 72, nAz: 16, w: 3.25, op: 0.48 },
    { colat: 65, nAz: 14, w: 3,    op: 0.42 },
    { colat: 57, nAz: 12, w: 2.6,  op: 0.36 },
    { colat: 48, nAz: 10, w: 2.25, op: 0.30 },
    { colat: 40, nAz: 10, w: 2,    op: 0.25 },
    { colat: 32, nAz: 8,  w: 1.75, op: 0.20 },
    { colat: 10, nAz: 8,  w: 1.5,  op: 0.22 },
    { colat: 17, nAz: 10, w: 1.5,  op: 0.18 },
    { colat: 170,nAz: 8,  w: 1.5,  op: 0.22 },
    { colat: 163,nAz: 10, w: 1.5,  op: 0.18 },
  ];

  seeds.forEach(cfg => {
    const theta = cfg.colat * Math.PI / 180;
    for (let ai = 0; ai < cfg.nAz; ai++) {
      const phi = (ai / cfg.nAz) * 2 * Math.PI;
      const r0 = 1.005;
      const [sx, sy, sz] = sph2xyz(r0, theta, phi);

      const { Br } = computeB(r0, theta, phi);
      const sign = Br >= 0 ? 1 : -1;

      const ptsOut = traceFieldLine(sx, sy, sz, sign, 0.004, 10000, 12);
      const ptsIn  = traceFieldLine(sx, sy, sz, -sign, 0.004, 10000, 12);

      const reversed = [];
      for (let k = ptsIn.length - 3; k >= 3; k -= 3) {
        reversed.push(ptsIn[k], ptsIn[k+1], ptsIn[k+2]);
      }
      const pts = reversed.concat(ptsOut);
      if (pts.length < 12) continue;

      const colors = [];
      for (let j = 0; j < pts.length; j += 3) {
        const [cr, cg, cb] = vertexColor(pts[j], pts[j+1], pts[j+2]);
        colors.push(cr, cg, cb);
      }

      const geo = new LineGeometry();
      geo.setPositions(pts);
      geo.setColors(colors);
      const mat = new LineMaterial({
        vertexColors: true,
        linewidth: cfg.w,
        transparent: true,
        opacity: cfg.op,
        resolution,
        depthWrite: false
      });
      const line = new Line2(geo, mat);
      line.computeLineDistances();
      magneticGroup.add(line);
      allLineMats.push(mat);
    }
  });

  /* ---- magnetic pole positions (from dipole coefficients) ---- */
  const g10 = G[_i(1,0)], g11 = G[_i(1,1)], h11 = H[_i(1,1)];
  const dM = Math.sqrt(g10*g10 + g11*g11 + h11*h11);
  const mnTh = Math.acos(-g10 / dM);
  const mnPh = Math.atan2(-h11, -g11);
  const msTh = Math.PI - mnTh;
  const msPh = mnPh + Math.PI;

  /* ---- pole markers ---- */
  const pGeo  = new THREE.SphereGeometry(0.04, 16, 16);
  const glGeo = new THREE.SphereGeometry(0.09, 16, 16);

  function addPole(th, ph, color) {
    const [px, py, pz] = sph2xyz(1.04, th, ph);
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(px, py, pz);
    magneticGroup.add(m);
    const gl = new THREE.Mesh(glGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.30 }));
    gl.position.set(px, py, pz);
    magneticGroup.add(gl);
  }
  addPole(mnTh, mnPh, 0x3366ff);
  addPole(msTh, msPh, 0xff3333);

  /* ---- pole labels ---- */
  function makeLabel(text, cssColor, w, h, fs) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.font = `bold ${fs}px PingFang SC,sans-serif`;
    ctx.fillStyle = cssColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w/2, h/2);
    const tex = new THREE.CanvasTexture(cv);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  }

  const [nlx,nly,nlz] = sph2xyz(1.32, mnTh, mnPh);
  const nLbl = makeLabel('地磁北极','#4488ff', 320, 80, 44);
  nLbl.scale.set(0.8, 0.2, 1); nLbl.position.set(nlx, nly, nlz);
  magneticGroup.add(nLbl);

  const [slx,sly,slz] = sph2xyz(1.32, msTh, msPh);
  const sLbl = makeLabel('地磁南极','#ff4444', 320, 80, 44);
  sLbl.scale.set(0.8, 0.2, 1); sLbl.position.set(slx, sly, slz);
  magneticGroup.add(sLbl);

  /* ---- magnetic axis (dashed) ---- */
  const [a1x,a1y,a1z] = sph2xyz(1.28, mnTh, mnPh);
  const [a2x,a2y,a2z] = sph2xyz(1.28, msTh, msPh);
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.Float32BufferAttribute([a1x,a1y,a1z, a2x,a2y,a2z], 3));
  magneticGroup.add(new THREE.Line(axGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })));

  /* ---- internal bar magnet ---- */
  const barLen = 0.825, barRad = 0.07;
  const halfGeo = new THREE.CylinderGeometry(barRad, barRad, barLen / 2, 16);

  const nHalf = new THREE.Mesh(halfGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  nHalf.position.y = barLen / 4;
  const sHalf = new THREE.Mesh(halfGeo, new THREE.MeshBasicMaterial({ color: 0x2266ff }));
  sHalf.position.y = -barLen / 4;

  const capGeo = new THREE.CircleGeometry(barRad, 16);
  const nCap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  nCap.position.y = barLen / 2; nCap.rotation.x = -Math.PI / 2;
  const sCap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0x2266ff }));
  sCap.position.y = -barLen / 2; sCap.rotation.x = Math.PI / 2;

  const nLabel = makeLabel('N', '#ffffff', 64, 64, 48);
  nLabel.scale.set(0.12, 0.12, 1);
  nLabel.position.y = barLen / 4;
  const sLabel = makeLabel('S', '#ffffff', 64, 64, 48);
  sLabel.scale.set(0.12, 0.12, 1);
  sLabel.position.y = -barLen / 4;

  const barGroup = new THREE.Group();
  barGroup.add(nHalf, sHalf, nCap, sCap, nLabel, sLabel);

  const axisDir = new THREE.Vector3(
    ...sph2xyz(1, msTh, msPh)
  ).normalize();
  barGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisDir);
  magneticGroup.add(barGroup);

  return { magneticGroup };
}

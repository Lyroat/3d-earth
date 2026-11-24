import { HelioVector, RotationAxis, Rotation_EQJ_ECL, RotateVector } from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { DAY_MS } from './data.js';

// One scene unit = exactly one AU for both radii and centre-to-centre distances.
// EQJ -> fixed J2000 ecliptic -> Three (x, z, -y); both transforms are right-handed.
const eqToEcliptic = Rotation_EQJ_ECL();
export function toScene(vector) {
  const v = RotateVector(eqToEcliptic, vector);
  return new Vector3(v.x, v.z, -v.y);
}
export function positionAt(id, date) {
  return id === 'Sun' ? new Vector3() : toScene(HelioVector(id, date));
}
export function orientationAt(id, date) {
  const axis = RotationAxis(id, date);
  const alpha = axis.ra * Math.PI / 12;
  // IAU's reference node on the J2000 equatorial plane.
  const node = { x: -Math.sin(alpha), y: Math.cos(alpha), z: 0, t: axis.north.t };
  const north = toScene(axis.north).normalize();
  const x0 = toScene(node).normalize();
  const y0 = new Vector3().crossVectors(north, x0).normalize();
  const w = (axis.spin % 360) * Math.PI / 180;
  const prime = x0.multiplyScalar(Math.cos(w)).addScaledVector(y0, Math.sin(w)).normalize();
  // SphereGeometry's u=.5 is +X, +Y is north, east longitude points towards -Z.
  const z = new Vector3().crossVectors(prime, north).normalize();
  return {
    north,
    spin: axis.spin,
    quaternion: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(prime, north, z)),
  };
}
export function stateAt(id, date) {
  return { position: positionAt(id, date), ...orientationAt(id, date) };
}
export function sampleOrbit(body, date, steps = 192) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const when = new Date(date.getTime() + (i / steps - 0.5) * body.period * DAY_MS);
    const p = positionAt(body.id, when);
    if (body.id === 'Moon') p.sub(positionAt('Earth', when));
    points.push(p);
  }
  return points;
}

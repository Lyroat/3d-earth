import { Vector3 } from 'three';

// Keep a margin around the observed body, including Saturn's rings. Use the
// narrower field of view so portrait windows have the same useful zoom limit.
export const MAX_ZOOM_FRAME_FRACTION = 0.85;

export function observationHalfFov(camera) {
  const vertical = camera.getEffectiveFOV() * Math.PI / 360;
  return Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
}

export function minimumZoomDistance(camera, radius) {
  return radius / Math.sin(observationHalfFov(camera) * MAX_ZOOM_FRAME_FRACTION);
}

// Shared by wheel / drag / pinch dollying and the +/- buttons. The surface
// guard is centred on the body, not the possibly panned OrbitControls target.
export function limitCameraZoom({ camera, controls, centre, radius }) {
  const minimum = minimumZoomDistance(camera, radius);
  const offset = camera.position.clone().sub(centre);
  const retreated = offset.length() < minimum;
  if (retreated) {
    if (offset.lengthSq() === 0) {
      offset.copy(camera.position).sub(controls.target);
      if (offset.lengthSq() === 0) offset.set(0, 0, 1).applyQuaternion(camera.quaternion);
    }
    camera.position.copy(centre).add(offset.setLength(minimum));
    camera.lookAt(controls.target);
  }

  // Intersect the target-to-camera ray with the safe viewing sphere. A fixed
  // target distance alone is bypassable by panning; using the ray also avoids
  // snapping across a body when both camera and target are on its near side.
  const direction = new Vector3().subVectors(camera.position, controls.target);
  const distance = direction.length();
  direction.normalize();
  const toCentre = new Vector3().subVectors(centre, controls.target);
  const along = toCentre.dot(direction);
  const perpendicularSq = Math.max(0, toCentre.lengthSq() - along * along);
  const discriminant = minimum * minimum - perpendicularSq;
  controls.minDistance = 0;
  if (discriminant >= 0 && distance > 0) {
    const halfChord = Math.sqrt(discriminant);
    const near = along - halfChord, far = along + halfChord;
    if (far > 0 && distance >= near - minimum * 1e-10) controls.minDistance = far;
  }
  return retreated;
}

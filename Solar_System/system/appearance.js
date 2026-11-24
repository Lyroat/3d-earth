import { Vector3 } from 'three';
import { AU_KM, BODY_BY_ID, SIZE_OPTIONS } from './data.js';
import { observationHalfFov } from './zoom-limits.js';

export function appearanceRadius(body, scale) {
  return (body.ringOuter || body.radius) / AU_KM * scale;
}

// 10x / 25x are visual observation presets, not physical-radius multipliers.
// The Sun and planets share a gently compressed size reference so the Sun
// remains visibly larger. Saturn's reference includes its rings.
export function observationDiameter(body, scale) {
  if (scale === 1 || body.id === 'Moon') return 0;
  const radius = body.ringOuter || body.radius;
  return 1.4 * scale * (radius / BODY_BY_ID.Earth.radius) ** 0.2;
}

// Resize the ORIGINAL groups around their unchanged centres. No copies,
// screen-space offsets, orbit scaling, or camera motion are involved.
// Re-evaluate after camera/body movement so a distant planet stays visible.
export function updateAppearanceForView({ nodes, camera, scale, viewportHeight }) {
  camera.updateMatrixWorld();
  const worldPerPixelAtUnitDepth = 2 * Math.tan(camera.getEffectiveFOV() * Math.PI / 360) / viewportHeight;
  const viewPosition = new Vector3();
  for (const [id, node] of nodes) {
    const body = BODY_BY_ID[id];
    let multiplier = scale;
    const minimumDiameter = observationDiameter(body, scale);
    if (minimumDiameter && viewportHeight > 0) {
      viewPosition.copy(node.group.position).applyMatrix4(camera.matrixWorldInverse);
      const depth = -viewPosition.z;
      if (depth > camera.near) {
        const minimumRadius = minimumDiameter / 2 * depth * worldPerPixelAtUnitDepth;
        multiplier = Math.max(multiplier, minimumRadius / appearanceRadius(body, 1));
      }
    }
    node.group.scale.setScalar(multiplier);
    // Observation-mode fill makes night-side silhouettes visible without
    // changing the true sunlight direction or the body's rotation/position.
    const fill = node.mesh?.material.uniforms?.fillLight;
    if (fill) fill.value = scale === 1 ? 0.025 : 0.18;
  }
}

// Change body geometry, not the observer's scale. Moving the camera by the same
// multiplier would cancel the apparent enlargement in a planet-following view.
export function applyAppearanceScale({ nodes, camera, scale, previousScale, focusId = null, viewportHeight = 900 }) {
  const body = BODY_BY_ID[focusId || 'Sun'];
  let retreated = false;

  if (focusId && scale > previousScale) {
    // A focused camera can be engulfed by a bigger body. Retreat only if
    // necessary, not by the same multiplier that would cancel visual growth.
    const halfFov = observationHalfFov(camera);
    const frameFraction = 0.4 + 0.45 * Math.sqrt(scale / Math.max(...SIZE_OPTIONS));
    const minimumDistance = appearanceRadius(body, scale) / Math.sin(halfFov * frameFraction);
    const centre = nodes.get(focusId).group.position;
    const offset = camera.position.clone().sub(centre);
    if (offset.length() < minimumDistance) {
      if (offset.lengthSq() === 0) offset.set(0, 0, 1);
      camera.position.copy(centre).add(offset.setLength(minimumDistance));
      retreated = true;
    }
  }
  updateAppearanceForView({ nodes, camera, scale, viewportHeight });
  return retreated;
}

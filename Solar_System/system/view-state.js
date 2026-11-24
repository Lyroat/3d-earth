// Share one camera/OrbitControls pair without leaking damping or zoom limits
// between AU-scale observation and the independent teaching-scale scene.
function flushDamping(controls) {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
}
export function captureView(camera, controls) {
  flushDamping(controls);
  return {
    position: camera.position.toArray(), target: controls.target.toArray(),
    up: camera.up.toArray(), near: camera.near, far: camera.far,
    fov: camera.fov, zoom: camera.zoom,
    minDistance: controls.minDistance, maxDistance: controls.maxDistance,
    screenSpacePanning: controls.screenSpacePanning,
  };
}
export function restoreView(view, camera, controls) {
  flushDamping(controls);
  camera.position.fromArray(view.position);
  camera.up.fromArray(view.up);
  for (const key of ['near', 'far', 'fov', 'zoom']) camera[key] = view[key];
  controls.target.fromArray(view.target);
  for (const key of ['minDistance', 'maxDistance', 'screenSpacePanning']) controls[key] = view[key];
  camera.updateProjectionMatrix();
  controls.update();
}

// Teaching-scale model. These are NOT AU, ephemerides, or the solar-system clock.
export const SEM_SCALE = Object.freeze({
  sunR: 2, earthOrbitR: 18, earthR: 0.35, moonOrbitR: 1.2, moonR: 0.095,
});
export const SEASON_ANGLES = Object.freeze({
  spring: 0, summer: Math.PI / 2, autumn: Math.PI, winter: 3 * Math.PI / 2,
});
export function createTeachingState() {
  return {
    active: false, running: true, speed: 1, view: 'orbit', focus: 'sun',
    year: 0, month: 0, spin: 0, sunSpin: 0,
    showLabels: true, showOrbits: true, showSunlight: true,
    showSeasons: { spring: true, summer: true, autumn: true, winter: true },
  };
}
export function advanceTeachingState(state, seconds) {
  if (!state.active || !state.running || !Number.isFinite(seconds) || seconds <= 0) return;
  const elapsed = seconds * state.speed;
  if (state.view === 'orbit') {
    state.year += 0.15 * elapsed;
    state.month += 0.15 * (365.25 / 27.32) * elapsed;
  }
  // Match the former 60-fps appearance, but no longer depend on the frame rate.
  state.spin += (state.view === 'rotate' ? 0.6 : 1.2) * elapsed;
  state.sunSpin += 0.12 * elapsed;
}
export function setTeachingSeason(state, season) {
  if (!Object.prototype.hasOwnProperty.call(SEASON_ANGLES, season)) return false;
  state.year = SEASON_ANGLES[season];
  state.month = state.year * (365.25 / 27.32);
  return true;
}

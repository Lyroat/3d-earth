import { captureView, restoreView } from './view-state.js';

export function applyModeUI(document, mode) {
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-context]').forEach(panel => {
    panel.hidden = panel.dataset.context !== mode;
  });
  document.querySelectorAll('button[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('active', active);
  });
}

// One owner of camera transitions. A slow lazy load cannot override a later
// click; inactive scenes never advance. Neither mode's simulation is reset.
export function createModeController({ camera, controls, loadTeaching, onChange, onError }) {
  let active = 'solar', requested = 'solar', teaching, pending;
  let solarView, teachingView;
  return {
    get active() { return active; },
    get teaching() { return teaching; },
    async switchTo(mode) {
      if (!['solar', 'sem'].includes(mode)) return;
      requested = mode;
      if (mode === active) return;
      if (mode === 'sem' && !teaching) {
        try {
          pending ||= loadTeaching();
          teaching = await pending;
        } catch (error) {
          pending = null;
          onError(error);
          return;
        }
        if (requested !== mode || active === mode) return;
      }
      if (mode === 'sem') {
        solarView = captureView(camera, controls);
        teaching.activate();
        if (teachingView) restoreView(teachingView, camera, controls);
      } else {
        teachingView = captureView(camera, controls);
        teaching.deactivate();
        restoreView(solarView, camera, controls);
      }
      active = mode;
      onChange(mode);
    },
  };
}

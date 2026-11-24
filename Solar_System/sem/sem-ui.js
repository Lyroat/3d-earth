import { Scene, Color, Vector2 } from 'three';
import { t } from '../../i18n/lang.js';
import { createSEM } from './sem.js';

// This adapter owns only teaching controls. It never starts a RAF or touches
// the solar-system time, selected planet, enlargement, or label controls.
export function createTeachingMode({ camera, controls, textures, backgroundStars }) {
  const $ = id => document.getElementById(id);
  const scene = new Scene();
  scene.background = new Color(0x060a10);
  if (backgroundStars) scene.add(backgroundStars);
  const model = createSEM({
    scene, camera, controls, textures, translate: t,
    resolution: new Vector2(innerWidth, innerHeight),
  });
  const events = new AbortController();
  const on = (element, type, handler) => element.addEventListener(type, handler, { signal: events.signal });
  let season = null;
  const updateButtons = (selector, key, value) => {
    document.querySelectorAll(selector).forEach(button => {
      const active = button.dataset[key] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  function lesson(key) {
    return `<h2>${t(`kc.sem-${key}.title`)}</h2><div class="lesson-description">${t(`kc.sem-${key}.desc`)}</div>`;
  }
  function refresh() {
    const state = model.getState();
    updateButtons('[data-sem-view]', 'semView', state.view);
    updateButtons('[data-sem-focus]', 'semFocus', state.focus);
    updateButtons('[data-season]', 'season', season);
    $('sem-lesson').innerHTML = lesson(state.view);
    $('sem-season-card').hidden = !season;
    $('sem-season-lesson').innerHTML = season ? lesson(season) : '';
    $('sem-speed').value = String(state.speed);
    $('sem-speed-val').textContent = `${state.speed.toFixed(1)}×`;
    $('sem-time-state').textContent = !state.running ? t('obs.teachingPaused')
      : state.speed === 0 ? t('obs.teachingZero') : t('obs.teachingRunning');
    $('sem-pause').textContent = state.running ? 'Ⅱ' : '▶';
    $('sem-pause').setAttribute('aria-label', t(state.running ? 'sem.pause' : 'sem.resume'));
    $('sem-labels').checked = state.showLabels;
    $('sem-orbits').checked = state.showOrbits;
    $('sem-sunlight').checked = state.showSunlight;
    document.querySelectorAll('[data-sem-marker]').forEach(input => {
      input.checked = state.showSeasons[input.dataset.semMarker];
    });
  }
  document.querySelectorAll('[data-sem-view]').forEach(button => on(button, 'click', () => {
    model.applyView(button.dataset.semView); refresh();
  }));
  document.querySelectorAll('[data-sem-focus]').forEach(button => on(button, 'click', () => {
    model.applyFocus(button.dataset.semFocus); refresh();
  }));
  document.querySelectorAll('[data-season]').forEach(button => on(button, 'click', () => {
    season = button.dataset.season;
    model.moveToSeason(season); refresh();
  }));
  on($('sem-close-season'), 'click', () => { season = null; refresh(); });
  on($('sem-refocus'), 'click', () => model.applyFocus(model.getState().focus));
  on($('sem-speed'), 'input', event => { model.setSpeed(Number(event.target.value)); refresh(); });
  function toggleRunning() { model.setRunning(!model.getState().running); refresh(); }
  on($('sem-pause'), 'click', toggleRunning);
  on($('sem-labels'), 'change', event => model.setLabels(event.target.checked));
  on($('sem-orbits'), 'change', event => model.setOrbits(event.target.checked));
  on($('sem-sunlight'), 'change', event => model.setSunlight(event.target.checked));
  document.querySelectorAll('[data-sem-marker]').forEach(input => on(input, 'change', () => {
    model.setSeasonVisible(input.dataset.semMarker, input.checked);
  }));
  on(window, 'langchange', () => { model.refreshLabels(); refresh(); });
  refresh();
  return {
    scene, toggleRunning,
    pause() { model.setRunning(false); refresh(); },
    activate() { model.activate(); refresh(); },
    deactivate: model.deactivate,
    update(seconds) {
      // Classroom animation should not leap after a backgrounded tab resumes.
      model.update(Math.min(seconds, 0.1));
      backgroundStars?.position.copy(camera.position);
    },
    resize: model.resize,
    dispose() { events.abort(); model.dispose(); },
  };
}

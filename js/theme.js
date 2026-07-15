// Selector de tema Día/Noche (Daylight/Console). Elección explícita del
// usuario vía #themeToggle, persistida en localStorage. El atributo
// data-theme ya lo fija el script inline en <head> (evita parpadeo al
// cargar); este módulo solo sincroniza el icono del botón y lo conecta.
const KEY = 'zepo_theme';

const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'console' ? 'console' : 'daylight';
}

function applyIcon(btn) {
  if (!btn) return;
  const consoleOn = getTheme() === 'console';
  // El icono muestra el tema al que se cambiaría al pulsar.
  btn.innerHTML = consoleOn ? SUN_SVG : MOON_SVG;
  btn.setAttribute('aria-label', consoleOn ? 'Switch to day theme' : 'Switch to night theme');
}

export function setTheme(theme) {
  const t = theme === 'console' ? 'console' : 'daylight';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch (_e) { /* almacenamiento no disponible: no persiste, sin más */ }
  applyIcon(document.getElementById('themeToggle'));
}

export function initTheme() {
  const btn = document.getElementById('themeToggle');
  applyIcon(btn);
  if (btn) {
    btn.addEventListener('click', () => setTheme(getTheme() === 'console' ? 'daylight' : 'console'));
  }
}

// Internacionalización EN/ES.
// - Elementos estáticos: atributos data-en / data-es (se traduce textContent).
// - Elementos dinámicos: pick(en, es) según el idioma actual + callback onLangChange.

const LANG_KEY = 'zepo_lang';
let _lang = 'en';
// Continuidad en el mismo dispositivo y para la pantalla de login (pre-sesión).
// La preferencia entre dispositivos vive en el perfil (profiles.language) y se
// aplica tras iniciar sesión (ver main.js).
try {
  const s = localStorage.getItem(LANG_KEY);
  if (s === 'en' || s === 'es') _lang = s;
} catch (_e) { /* almacenamiento no disponible */ }
const _listeners = [];

export function getLang() {
  return _lang;
}

// Devuelve el texto según idioma. Acepta pick('EN','ES') o pick({en,es}).
export function pick(en, es) {
  if (en && typeof en === 'object') {
    return _lang === 'es' && en.es ? en.es : en.en;
  }
  return _lang === 'es' && es ? es : en;
}

// Registrar callbacks que re-renderizan las partes dinámicas al cambiar idioma.
export function onLangChange(fn) {
  _listeners.push(fn);
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-en]').forEach((el) => {
    if (!['INPUT', 'OPTION', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      el.textContent = el.dataset[_lang] || el.dataset.en;
    }
  });
  root.querySelectorAll('option[data-en]').forEach((el) => {
    el.textContent = _lang === 'es' && el.dataset.es ? el.dataset.es : el.dataset.en;
  });
}

export function setLang(l) {
  _lang = l === 'es' ? 'es' : 'en';
  try { localStorage.setItem(LANG_KEY, _lang); } catch (_e) { /* almacenamiento no disponible */ }
  document.querySelectorAll('.lbtn').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === _lang);
  });
  applyStatic();
  _listeners.forEach((fn) => fn());
}

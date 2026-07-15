// Internacionalización EN/ES.
// - Elementos estáticos: atributos data-en / data-es (se traduce textContent).
// - Elementos dinámicos: pick(en, es) según el idioma actual + callback onLangChange.

let _lang = 'en';
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
  _lang = l;
  document.querySelectorAll('.lbtn').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === l);
  });
  applyStatic();
  _listeners.forEach((fn) => fn());
}

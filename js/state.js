// Modelo de una POC en memoria + utilidades de acceso por ruta.
// La forma del objeto mapea 1:1 con las columnas de la tabla `pocs` de Supabase
// (Fase 1), de modo que persistir sea trivial en local y en la BD.

export function emptyPoc() {
  return {
    id: null,
    company: '',
    ae: '',
    kickoff_date: '',
    end_date: '',
    status: 'draft',
    contacts: [{ name: '', role: '', email: '', phone: '' }],
    objective: '',
    use_cases: [],
    scope_in: '',
    scope_out: '',
    users: '',
    vectors: {
      ph: { on: false, campaigns: '', themes: '', whitelisting: '' },
      vi: { on: false, attempts: '', hours: '', device: '', consent: '' },
      sm: { on: false, campaigns: '', region: '', device: '' },
    },
    precheck: {}, // { [checkId]: 'done' | 'blocked' }
    timeline: [], // [{ date, note }] alineado por índice con TIMELINE
    comments: '',
  };
}

// Rellena huecos de un objeto cargado (retrocompat / robustez).
export function normalizePoc(raw) {
  const base = emptyPoc();
  if (!raw || typeof raw !== 'object') return base;
  const p = { ...base, ...raw };
  p.contacts = Array.isArray(raw.contacts) && raw.contacts.length
    ? raw.contacts.map((c) => ({ name: '', role: '', email: '', phone: '', ...c }))
    : base.contacts;
  p.use_cases = Array.isArray(raw.use_cases) ? raw.use_cases : [];
  p.vectors = {
    ph: { ...base.vectors.ph, ...(raw.vectors && raw.vectors.ph) },
    vi: { ...base.vectors.vi, ...(raw.vectors && raw.vectors.vi) },
    sm: { ...base.vectors.sm, ...(raw.vectors && raw.vectors.sm) },
  };
  p.precheck = raw.precheck && typeof raw.precheck === 'object' ? { ...raw.precheck } : {};
  p.timeline = Array.isArray(raw.timeline) ? raw.timeline : [];
  return p;
}

// POC actualmente en edición (en Fase 1 el router la reemplaza al abrir una).
const store = { poc: emptyPoc() };

export function getPoc() {
  return store.poc;
}

export function setPoc(p) {
  store.poc = normalizePoc(p);
  return store.poc;
}

// Acceso por ruta con notación de puntos: getByPath(poc, 'vectors.ph.campaigns')
export function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setByPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[last] = value;
}

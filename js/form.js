// Formulario de una POC (vista de detalle).
// - mountFormOnce(): adjunta listeners a los elementos estáticos UNA vez.
// - renderForm(): pinta todo LEYENDO del estado (se llama al abrir cada POC y
//   al cambiar de idioma). Reconstruir desde el estado evita pérdidas de datos.

import { USE_CASES, CHECKS, TIMELINE, STATUSES } from './data.js';
import { pick, onLangChange } from './i18n.js';
import { getPoc, getByPath, setByPath } from './state.js';
import { savePoc } from './persistence.js';
import { getProfile } from './auth.js';

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── autosave ──────────────────────────────────────────────
let saveTimer = null;
let saving = false;
let onSaved = null; // (ok, err?) => void

export function setOnSaved(fn) { onSaved = fn; }

async function doSave() {
  if (saving) { scheduleSave(); return; }
  saving = true;
  try {
    await savePoc(getPoc());
    if (onSaved) onSaved(true);
  } catch (e) {
    console.error('Error guardando la POC:', e);
    if (onSaved) onSaved(false, e);
  } finally {
    saving = false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 700);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  await doSave();
}

function changed() {
  scheduleSave();
}

// ── ESTADO ────────────────────────────────────────────────
function buildStatus() {
  const wrap = document.getElementById('statusPills');
  wrap.innerHTML = '';
  STATUSES.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'st-pill' + (getPoc().status === s.id ? ' on' : '');
    b.dataset.st = s.id;
    b.textContent = pick(s);
    b.addEventListener('click', () => { getPoc().status = s.id; buildStatus(); changed(); });
    wrap.appendChild(b);
  });
}

// ── CONTACTOS ─────────────────────────────────────────────
function buildContacts() {
  const wrap = document.getElementById('contactsList');
  wrap.innerHTML = '';
  const poc = getPoc();
  poc.contacts.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'contact-row';
    const del = poc.contacts.length > 1
      ? `<button class="contact-del" type="button" title="${pick('Remove', 'Eliminar')}" data-del="${i}">✕</button>` : '';
    row.innerHTML = `
      ${del}
      <div class="contact-grid">
        <div class="mini"><label>${pick('Name', 'Nombre')} <span class="req">*</span></label>
          <input data-c="${i}" data-f="name" value="${escAttr(c.name)}" placeholder="${pick('Full name', 'Nombre completo')}"></div>
        <div class="mini"><label>${pick('Role', 'Rol')}</label>
          <input data-c="${i}" data-f="role" value="${escAttr(c.role)}" placeholder="${pick('e.g. CISO', 'p. ej. CISO')}"></div>
        <div class="mini"><label>Email</label>
          <input data-c="${i}" data-f="email" type="email" value="${escAttr(c.email)}" placeholder="name@company.com"></div>
        <div class="mini"><label>${pick('Phone', 'Teléfono')}</label>
          <input data-c="${i}" data-f="phone" value="${escAttr(c.phone)}" placeholder="+34 ..."></div>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('input[data-c]').forEach((inp) => {
    if (inp.dataset.f === 'name') inp.classList.toggle('invalid', !inp.value.trim());
    inp.addEventListener('input', () => {
      const i = +inp.dataset.c;
      getPoc().contacts[i][inp.dataset.f] = inp.value;
      if (inp.dataset.f === 'name') inp.classList.toggle('invalid', !inp.value.trim());
      changed();
    });
  });
  wrap.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      getPoc().contacts.splice(+btn.dataset.del, 1);
      buildContacts(); changed();
    });
  });
}

// ── CASOS DE USO ──────────────────────────────────────────
function buildUseCases() {
  const g = document.getElementById('ucGrid');
  g.innerHTML = '';
  const sel = getPoc().use_cases;
  USE_CASES.forEach((uc) => {
    const on = sel.includes(uc.id);
    const el = document.createElement('div');
    el.className = 'uc-chip' + (on ? ' on' : '');
    el.innerHTML = `<div class="uc-cb" style="opacity:${on ? 1 : 0.2}">✓</div><div class="uc-lbl">${pick(uc)}</div>`;
    el.addEventListener('click', () => {
      const arr = getPoc().use_cases;
      const idx = arr.indexOf(uc.id);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(uc.id);
      buildUseCases(); changed();
    });
    g.appendChild(el);
  });
}

// ── PRE-CHECK ─────────────────────────────────────────────
function buildPrecheck() {
  const list = document.getElementById('pcheckList');
  list.innerHTML = '';
  const st = getPoc().precheck;
  CHECKS.forEach((c) => {
    const state = st[c.id];
    const el = document.createElement('div');
    el.className = 'pcheck-row' + (state === 'done' ? ' done' : state === 'blocked' ? ' blocked' : '');
    const showRisk = state === 'blocked';
    el.innerHTML = `
      <div class="pcheck-box" style="opacity:${state ? 1 : 0.25}">${state === 'done' ? '✓' : state === 'blocked' ? '✗' : ''}</div>
      <div class="pcheck-content">
        <div class="pcheck-title">${pick(c.en, c.es)}</div>
        ${showRisk ? `<div class="pcheck-risk">⚠ ${pick(c.risk_en, c.risk_es)}</div>` : ''}
        <div class="pcheck-toggle" style="margin-top:6px;">
          <button class="pt-btn ${state === 'done' ? 'active-done' : ''}" type="button" data-check="${c.id}" data-val="done">${pick('✓ Done', '✓ Listo')}</button>
          <button class="pt-btn ${state === 'blocked' ? 'active-blocked' : ''}" type="button" data-check="${c.id}" data-val="blocked">${pick('✗ Blocked', '✗ Bloqueado')}</button>
        </div>
      </div>`;
    list.appendChild(el);
  });
  list.querySelectorAll('[data-check]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.check;
      const val = btn.dataset.val;
      const st2 = getPoc().precheck;
      st2[id] = st2[id] === val ? undefined : val;
      buildPrecheck(); changed();
    });
  });
}

// ── TIMELINE ──────────────────────────────────────────────
function ensureTimeline() {
  const tl = getPoc().timeline;
  for (let i = 0; i < TIMELINE.length; i++) if (!tl[i]) tl[i] = { date: '', note: '' };
  tl.length = TIMELINE.length;
}
function buildTimeline() {
  ensureTimeline();
  const list = document.getElementById('tlList');
  list.innerHTML = '';
  const tl = getPoc().timeline;
  TIMELINE.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'tl-row';
    row.innerHTML = `
      <div class="tl-cal"><input type="date" data-tl="${i}" data-f="date" value="${escAttr(tl[i].date)}"></div>
      <div class="tl-spine"><div class="tl-dot"></div><div class="tl-line"></div></div>
      <div class="tl-body">
        <div class="tl-label">${pick(r.label)}</div>
        <input data-tl="${i}" data-f="note" value="${escAttr(tl[i].note)}" placeholder="${pick(r.ph)}">
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('input[data-tl]').forEach((inp) => {
    inp.addEventListener('input', () => {
      getPoc().timeline[+inp.dataset.tl][inp.dataset.f] = inp.value;
      changed();
    });
  });
}

// ── VECTORES ──────────────────────────────────────────────
function applyVectors() {
  document.querySelectorAll('.vc[data-v]').forEach((card) => {
    const v = card.dataset.v;
    const on = getPoc().vectors[v].on;
    card.classList.toggle('on', on);
    const tick = card.querySelector('.vc-tick');
    if (tick) tick.style.opacity = on ? '1' : '0.16';
    const panel = document.getElementById('vd_' + v);
    if (panel) panel.classList.toggle('show', on);
  });
}
function wireVectorsOnce() {
  document.querySelectorAll('.vc[data-v]').forEach((card) => {
    card.addEventListener('click', () => {
      const v = card.dataset.v;
      getPoc().vectors[v].on = !getPoc().vectors[v].on;
      applyVectors(); changed();
    });
  });
}

// ── TÍTULO + RESUMEN ──────────────────────────────────────
export function updateTitle() {
  const co = getPoc().company;
  const t = document.getElementById('topTitle');
  if (t) t.textContent = co ? co + ' — PoC Kickoff' : 'PoC Kickoff Agreement';
}

// Línea "Preparado por" del banner: dueño de la PoC (implícito). Para una PoC
// nueva es el usuario en sesión; para una existente, el nombre guardado (ae).
function setPreparedBy() {
  const el = document.getElementById('preparedBy');
  if (!el) return;
  const p = getProfile();
  el.textContent = getPoc().ae || (p && p.full_name) || '—';
}

// ── MONTAJE / RENDER ──────────────────────────────────────
let mounted = false;

export function mountFormOnce() {
  if (mounted) return;
  mounted = true;

  document.querySelectorAll('[data-bind]').forEach((el) => {
    const path = el.dataset.bind;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      setByPath(getPoc(), path, el.value);
      if (path === 'company') updateTitle();
      changed();
    });
  });

  const addBtn = document.getElementById('addContact');
  if (addBtn) addBtn.addEventListener('click', () => {
    getPoc().contacts.push({ name: '', role: '', email: '', phone: '' });
    buildContacts(); changed();
  });

  wireVectorsOnce();
  onLangChange(() => { if (document.getElementById('view-poc').style.display !== 'none') renderForm(); });
}

// Pinta el formulario completo desde el estado actual (getPoc()).
export function renderForm() {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.value = getByPath(getPoc(), el.dataset.bind) ?? '';
  });
  buildStatus();
  buildContacts();
  buildUseCases();
  buildPrecheck();
  buildTimeline();
  applyVectors();
  updateTitle();
  setPreparedBy();
}

// Vista de listado de PoCs. RLS decide qué filas llegan.
// - AE: ve solo las suyas → PoC · Kickoff · End · Status · Users.
// - Admin: ve todas (o las suyas con el toggle) → añade Owner (nombre en
//   negrita + rol debajo) y Department, tomados del perfil del dueño.
import { listPocs, deletePoc } from './persistence.js';
import { pick } from './i18n.js';
import { isAdmin, getProfile, isDemo } from './auth.js';
import { STATUSES, DEPARTMENTS } from './data.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function statusLabel(id) {
  return pick(STATUSES.find((s) => s.id === id) || STATUSES[0]);
}
function deptLabel(id) {
  const d = DEPARTMENTS.find((x) => x.id === id);
  return d ? pick(d) : '—';
}
function fmtDate(d) {
  return d ? new Date(d + 'T12:00:00').toLocaleDateString() : '—';
}

let scope = 'all'; // solo admin: 'all' | 'my'

function renderScope(admin) {
  const el = document.getElementById('listScope');
  if (!el) return;
  if (!admin) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `
    <button class="scope-btn ${scope === 'all' ? 'on' : ''}" data-scope="all">${pick('All PoCs', 'Todas las PoCs')}</button>
    <button class="scope-btn ${scope === 'my' ? 'on' : ''}" data-scope="my">${pick('My PoCs', 'Mis PoCs')}</button>`;
  el.querySelectorAll('[data-scope]').forEach((b) => {
    b.addEventListener('click', () => { scope = b.dataset.scope; renderList(); });
  });
}

export async function renderList() {
  const body = document.getElementById('list-body');
  const admin = isAdmin();
  renderScope(admin);
  const newBtn = document.getElementById('listNew');
  if (newBtn) newBtn.style.display = isDemo() ? 'none' : ''; // demo: sin crear PoCs

  const title = document.getElementById('listTitle');
  if (title) {
    title.textContent = admin
      ? (scope === 'my' ? pick('My PoCs', 'Mis PoCs') : pick('All PoCs', 'Todas las PoCs'))
      : pick('My PoCs', 'Mis PoCs');
  }

  const cls = admin ? 'lt-row lt-admin' : 'lt-row';
  body.innerHTML = `<div class="list-loading">${pick('Loading…', 'Cargando…')}</div>`;

  let rows;
  try {
    rows = await listPocs();
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="list-empty">${pick('Could not load PoCs.', 'No se pudieron cargar las PoCs.')}</div>`;
    return;
  }

  if (admin && scope === 'my') {
    const me = getProfile();
    rows = rows.filter((r) => me && r.ae_id === me.id);
  }

  if (!rows.length) {
    body.innerHTML = `<div class="list-empty">${pick('No PoCs yet — create your first one.', 'Aún no hay PoCs — crea la primera.')}</div>`;
    return;
  }

  const head = `<div class="${cls} lt-head">
      <div class="lt-c">${pick('PoC', 'PoC')}</div>
      ${admin ? `<div class="lt-c">${pick('Owner', 'Dueño')}</div><div class="lt-c">${pick('Department', 'Departamento')}</div>` : ''}
      <div class="lt-c">${pick('Kickoff', 'Kick-off')}</div>
      <div class="lt-c">${pick('End', 'Fin')}</div>
      <div class="lt-c">${pick('Status', 'Estado')}</div>
      <div class="lt-c">${pick('Users', 'Usuarios')}</div>
      <div class="lt-c"></div>
    </div>`;

  const items = rows.map((r) => {
    const name = escHtml(r.title || r.company || pick('(untitled)', '(sin título)'));
    const sub = r.company && r.title && r.title !== r.company ? `<span class="lt-sub">${escHtml(r.company)}</span>` : '';
    const owner = r.owner || {};
    const ownerName = owner.full_name || r.ae_name || '—';
    let adminCols = '';
    if (admin) {
      // Nombre del dueño en negrita, su rol debajo (no negrita).
      adminCols = `
        <div class="lt-c lt-name">${escHtml(ownerName)}<span class="lt-sub">${escHtml(owner.job_title || '—')}</span></div>
        <div class="lt-c">${deptLabel(owner.department)}</div>`;
    }
    return `<div class="${cls} lt-item" data-id="${r.id}">
        <div class="lt-c lt-name">${name}${sub}</div>
        ${adminCols}
        <div class="lt-c t-num">${fmtDate(r.kickoff_date)}</div>
        <div class="lt-c t-num">${fmtDate(r.end_date)}</div>
        <div class="lt-c"><span class="badge" data-st="${r.status}">${statusLabel(r.status)}</span></div>
        <div class="lt-c t-num">${r.users_in_scope != null ? r.users_in_scope : '—'}</div>
        <div class="lt-c au-actions">${isDemo() ? '' : `<button class="lt-del" data-del="${r.id}" title="${pick('Delete', 'Eliminar')}">🗑</button>`}</div>
      </div>`;
  }).join('');

  body.innerHTML = head + items;

  body.querySelectorAll('.lt-item').forEach((el) => {
    el.addEventListener('click', () => { location.hash = '#/poc/' + el.dataset.id; });
  });
  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(pick('Delete this PoC? This cannot be undone.', '¿Eliminar esta PoC? No se puede deshacer.'))) return;
      try {
        await deletePoc(btn.dataset.del);
        renderList();
      } catch (err) {
        alert(pick('Could not delete.', 'No se pudo eliminar.'));
      }
    });
  });
}

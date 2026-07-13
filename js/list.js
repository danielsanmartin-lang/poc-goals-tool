// Vista de listado de POCs. RLS decide qué filas llegan: un AE ve las suyas,
// el admin ve todas (y en ese caso mostramos la columna AE).
import { listPocs, deletePoc } from './persistence.js';
import { pick } from './i18n.js';
import { isAdmin } from './auth.js';
import { STATUSES } from './data.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function statusLabel(id) {
  return pick(STATUSES.find((s) => s.id === id) || STATUSES[0]);
}
function fmtDate(d) {
  return d ? new Date(d + 'T12:00:00').toLocaleDateString() : '—';
}

export async function renderList() {
  const body = document.getElementById('list-body');
  const admin = isAdmin();
  const cls = admin ? 'lt-row has-ae' : 'lt-row';
  body.innerHTML = `<div class="list-loading">${pick('Loading…', 'Cargando…')}</div>`;

  let rows;
  try {
    rows = await listPocs();
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="list-empty">${pick('Could not load POCs.', 'No se pudieron cargar las POCs.')}</div>`;
    return;
  }
  if (!rows.length) {
    body.innerHTML = `<div class="list-empty">${pick('No POCs yet — create your first one.', 'Aún no hay POCs — crea la primera.')}</div>`;
    return;
  }

  const head = `<div class="${cls} lt-head">
      <div class="lt-c">${pick('POC', 'POC')}</div>
      ${admin ? '<div class="lt-c">AE</div>' : ''}
      <div class="lt-c">${pick('Kickoff', 'Kick-off')}</div>
      <div class="lt-c">${pick('Status', 'Estado')}</div>
      <div class="lt-c">${pick('Users', 'Usuarios')}</div>
      <div class="lt-c"></div>
    </div>`;

  const items = rows.map((r) => {
    const name = escHtml(r.title || r.company || pick('(untitled)', '(sin título)'));
    const sub = r.company && r.title && r.title !== r.company ? `<span class="lt-sub">${escHtml(r.company)}</span>` : '';
    return `<div class="${cls} lt-item" data-id="${r.id}">
        <div class="lt-c lt-name">${name}${sub}</div>
        ${admin ? `<div class="lt-c">${escHtml(r.ae_name || '—')}</div>` : ''}
        <div class="lt-c">${fmtDate(r.kickoff_date)}</div>
        <div class="lt-c"><span class="badge" data-st="${r.status}">${statusLabel(r.status)}</span></div>
        <div class="lt-c">${r.users_in_scope != null ? r.users_in_scope : '—'}</div>
        <div class="lt-c au-actions"><button class="lt-del" data-del="${r.id}" title="${pick('Delete', 'Eliminar')}">🗑</button></div>
      </div>`;
  }).join('');

  body.innerHTML = head + items;

  body.querySelectorAll('.lt-item').forEach((el) => {
    el.addEventListener('click', () => { location.hash = '#/poc/' + el.dataset.id; });
  });
  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(pick('Delete this POC? This cannot be undone.', '¿Eliminar esta POC? No se puede deshacer.'))) return;
      try {
        await deletePoc(btn.dataset.del);
        renderList();
      } catch (err) {
        alert(pick('Could not delete.', 'No se pudo eliminar.'));
      }
    });
  });
}

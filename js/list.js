// Vista de listado de PoCs. RLS decide qué filas llegan.
// - AE: ve solo las suyas → PoC · Kickoff · End · Status · Users.
// - Admin: ve todas (o las suyas con el toggle) → añade Owner (nombre en
//   negrita + rol debajo) y Department, tomados del perfil del dueño, y un
//   panel de métricas encima.
// Sobre las filas ya traídas se aplican (en cliente): filtros, orden por
// columnas y CSV. El borrado se sustituye por archivado (soft-delete).
import { listPocs, archivePoc, restorePoc } from './persistence.js';
import { pick, getLang } from './i18n.js';
import { isAdmin, getProfile, isDemo } from './auth.js';
import { STATUSES, DEPARTMENTS, OUTCOMES } from './data.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function statusLabel(id) {
  return pick(STATUSES.find((s) => s.id === id) || STATUSES[0]);
}
function outcomeLabel(id) {
  const o = OUTCOMES.find((x) => x.id === id);
  return o ? pick(o) : '';
}
function deptLabel(id) {
  const d = DEPARTMENTS.find((x) => x.id === id);
  return d ? pick(d) : '—';
}
// Fecha legible («12 jun 2026») según el idioma activo.
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString(
    getLang() === 'es' ? 'es-ES' : 'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );
}

// Monograma de empresa: iniciales + color estable derivado del nombre.
const MONO_CLASSES = ['m-t', 'm-b', 'm-v', 'm-a'];
function monogram(name) {
  const t = String(name || '?').trim() || '?';
  const parts = t.split(/\s+/).filter(Boolean);
  const ini = (((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || (parts[0] || '')[1] || '')).toUpperCase();
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="mono ${MONO_CLASSES[h % MONO_CLASSES.length]}">${escHtml(ini)}</span>`;
}
function ownerName(r) {
  return (r.owner && r.owner.full_name) || r.ae_name || '';
}

// Una PoC está vencida si sigue "viva" y su fecha de fin ya pasó.
function isOverdue(r) {
  if (r.archived_at || !r.end_date) return false;
  if (!['draft', 'in_progress', 'extended'].includes(r.status)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(r.end_date + 'T12:00:00') < today;
}
// Días que quedan antes de la purga automática (30 días desde el archivado).
function daysUntilPurge(r) {
  if (!r.archived_at) return null;
  const elapsed = (Date.now() - new Date(r.archived_at).getTime()) / 86400000;
  return Math.max(0, Math.ceil(30 - elapsed));
}

let scope = 'all'; // solo admin: 'all' | 'my'
let allRows = [];  // último fetch (para repintar sin recargar)
let sort = { key: 'updated_at', dir: 'desc' };
let filters = { q: '', status: '', dept: '', owner: '', verdict: '', archived: false, overdue: false };

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

// Conjunto del scope actual (All/My) — base para métricas y opciones de owner.
function scopedRows(admin) {
  if (admin && scope === 'my') {
    const me = getProfile();
    return allRows.filter((r) => me && r.ae_id === me.id);
  }
  return allRows.slice();
}

// ── Barra de filtros + CSV ─────────────────────────────────
function renderToolbar(admin) {
  const el = document.getElementById('listToolbar');
  if (!el) return;
  const base = scopedRows(admin);
  const owners = [];
  const seen = new Set();
  base.forEach((r) => {
    if (!seen.has(r.ae_id)) { seen.add(r.ae_id); owners.push({ id: r.ae_id, name: ownerName(r) || '—' }); }
  });
  owners.sort((a, b) => a.name.localeCompare(b.name));

  const statusOpts = STATUSES.map((s) => `<option value="${s.id}" ${filters.status === s.id ? 'selected' : ''}>${pick(s)}</option>`).join('');
  const verdictOpts = OUTCOMES.map((o) => `<option value="${o.id}" ${filters.verdict === o.id ? 'selected' : ''}>${pick(o)}</option>`).join('');
  const deptOpts = DEPARTMENTS.map((d) => `<option value="${d.id}" ${filters.dept === d.id ? 'selected' : ''}>${pick(d)}</option>`).join('');
  const ownerOpts = owners.map((o) => `<option value="${o.id}" ${filters.owner === o.id ? 'selected' : ''}>${escHtml(o.name)}</option>`).join('');

  el.innerHTML = `
    <input type="search" class="tb-search" id="fltQ" placeholder="${pick('Search company or PoC…', 'Buscar empresa o PoC…')}" value="${escHtml(filters.q)}">
    <select class="tb-sel" id="fltStatus"><option value="">${pick('All statuses', 'Todos los estados')}</option>${statusOpts}</select>
    <select class="tb-sel" id="fltVerdict"><option value="">${pick('All verdicts', 'Todos los veredictos')}</option>${verdictOpts}</select>
    ${admin ? `<select class="tb-sel" id="fltDept"><option value="">${pick('All departments', 'Todos los departamentos')}</option>${deptOpts}</select>` : ''}
    ${admin ? `<select class="tb-sel" id="fltOwner"><option value="">${pick('All owners', 'Todos los dueños')}</option>${ownerOpts}</select>` : ''}
    <label class="tb-check"><input type="checkbox" id="fltArchived" ${filters.archived ? 'checked' : ''}> ${pick('Archived', 'Archivadas')}</label>
    <button class="tb-btn" id="fltCsv" title="${pick('Export CSV', 'Exportar CSV')}">↓ CSV</button>`;

  const q = document.getElementById('fltQ');
  q.addEventListener('input', () => { filters.q = q.value; paint(); });
  document.getElementById('fltStatus').addEventListener('change', (e) => { filters.status = e.target.value; paint(); });
  document.getElementById('fltVerdict').addEventListener('change', (e) => { filters.verdict = e.target.value; paint(); });
  const dSel = document.getElementById('fltDept');
  if (dSel) dSel.addEventListener('change', (e) => { filters.dept = e.target.value; paint(); });
  const oSel = document.getElementById('fltOwner');
  if (oSel) oSel.addEventListener('change', (e) => { filters.owner = e.target.value; paint(); });
  document.getElementById('fltArchived').addEventListener('change', (e) => { filters.archived = e.target.checked; paint(); });
  document.getElementById('fltCsv').addEventListener('click', () => exportCsv(admin));
}

// ── Métricas (todos los usuarios; el admin respeta el scope All/My) ─────────
// `kpi` opcional: si se pasa, el tile es clicable y filtra la lista; si es
// null (Win rate, Duración media) el tile es informativo, no clicable.
// Iconos line-art de los KPIs (heredan color con currentColor); cada entrada
// es [tinte del chip, svg]. La clave es el kpi o, si no filtra, el iconKey.
const KPI_ICONS = {
  total:       ['', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>'],
  draft:       ['', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'],
  in_progress: ['k-teal', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  finished:    ['k-green', '<path d="M20 6 9 17l-5-5"/>'],
  extended:    ['k-amber', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M16 3v4M8 3v4"/>'],
  overdue:     ['k-red', '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>'],
  win:         ['k-teal', '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>'],
  dur:         ['', '<path d="M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4"/>'],
};
function metricTile(value, label, kpi, iconKey) {
  const [tint, paths] = KPI_ICONS[iconKey || kpi] || KPI_ICONS.total;
  const icon = `<span class="kico ${tint}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
  const active = kpi && isKpiActive(kpi);
  const attrs = kpi ? ` data-kpi="${kpi}"${active ? ' class="metric active"' : ' class="metric"'}` : ' class="metric metric-static"';
  return `<div${attrs}>${icon}<div class="metric-txt"><div class="metric-val">${value}</div><div class="metric-lbl">${label}</div></div></div>`;
}
// ¿El filtro actual corresponde a este KPI? (para resaltar el tile activo)
function isKpiActive(kpi) {
  if (kpi === 'total') return !filters.status && !filters.verdict && !filters.overdue;
  if (kpi === 'overdue') return filters.overdue;
  return filters.status === kpi && !filters.overdue; // un estado
}
function renderMetrics(admin) {
  const el = document.getElementById('listMetrics');
  if (!el) return;
  const active = scopedRows(admin).filter((r) => !r.archived_at);
  const byStatus = {};
  STATUSES.forEach((s) => { byStatus[s.id] = 0; });
  active.forEach((r) => { if (byStatus[r.status] != null) byStatus[r.status]++; });
  const overdue = active.filter(isOverdue).length;

  const withV = active.filter((r) => ['success', 'neutral', 'lost'].includes(r.outcome));
  const wins = withV.filter((r) => r.outcome === 'success').length;
  const winRate = withV.length ? Math.round((wins / withV.length) * 100) + '%' : '—';

  const durs = active
    .map((r) => (r.kickoff_date && r.end_date) ? (new Date(r.end_date) - new Date(r.kickoff_date)) / 86400000 : null)
    .filter((v) => v != null && v >= 0);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) + 'd' : '—';

  el.hidden = false;
  el.innerHTML =
    metricTile(active.length, pick('Total', 'Total'), 'total') +
    STATUSES.map((s) => metricTile(byStatus[s.id], pick(s), s.id)).join('') +
    metricTile(`<span class="${overdue ? 'metric-warn' : ''}">${overdue}</span>`, pick('Overdue', 'Vencidas'), 'overdue') +
    metricTile(winRate, pick('Win rate', 'Tasa de éxito'), null, 'win') +
    metricTile(avg, pick('Avg. duration', 'Duración media'), null, 'dur');

  // Pinchar un KPI filtra la lista por ese criterio.
  el.querySelectorAll('[data-kpi]').forEach((tile) => {
    tile.addEventListener('click', () => {
      const kpi = tile.dataset.kpi;
      filters.archived = false; // los KPIs cuentan PoCs activas
      if (kpi === 'total') {
        filters.status = ''; filters.verdict = ''; filters.overdue = false;
      } else if (kpi === 'overdue') {
        filters.overdue = !filters.overdue; filters.status = '';
      } else {
        // estado: toggle
        const wasActive = filters.status === kpi && !filters.overdue;
        filters.status = wasActive ? '' : kpi;
        filters.overdue = false;
      }
      renderToolbar(admin); // refleja los selects/checkbox con el nuevo filtro
      paint();
    });
  });
}

// ── Filtro + orden ─────────────────────────────────────────
function applyFilters(rows) {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q) {
      const hay = `${r.title || ''} ${r.company || ''} ${ownerName(r)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.status && r.status !== filters.status) return false;
    if (filters.verdict && r.outcome !== filters.verdict) return false;
    if (filters.overdue && !isOverdue(r)) return false;
    if (filters.dept && (!r.owner || r.owner.department !== filters.dept)) return false;
    if (filters.owner && r.ae_id !== filters.owner) return false;
    return true;
  });
}

function sortVal(r, key) {
  switch (key) {
    case 'title': return (r.title || r.company || '').toLowerCase();
    case 'owner': return ownerName(r).toLowerCase();
    case 'department': return (r.owner && r.owner.department) || '';
    case 'kickoff_date': return r.kickoff_date || '';
    case 'end_date': return r.end_date || '';
    case 'status': return STATUSES.findIndex((s) => s.id === r.status);
    case 'users_in_scope': return r.users_in_scope != null ? r.users_in_scope : null;
    default: return r.updated_at || '';
  }
}
function sortRows(rows) {
  const { key, dir } = sort;
  return rows.sort((a, b) => {
    const va = sortVal(a, key); const vb = sortVal(b, key);
    const ea = va === '' || va == null || va === -1;
    const eb = vb === '' || vb == null || vb === -1;
    if (ea && eb) return 0;
    if (ea) return 1;   // vacíos siempre al final
    if (eb) return -1;
    let r;
    if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
    else r = String(va).localeCompare(String(vb));
    return dir === 'asc' ? r : -r;
  });
}

// ── CSV ────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv(admin) {
  const rows = sortRows(applyFilters(visibleBase(admin)));
  const cols = ['Company', 'PoC', ...(admin ? ['Owner', 'Department'] : []), 'Kickoff', 'End', 'Status', 'Users', 'Verdict', 'Overdue', 'Archived', 'Updated'];
  const lines = [cols.join(',')];
  rows.forEach((r) => {
    const cells = [
      r.company || '', r.title || r.company || '',
      ...(admin ? [ownerName(r), (r.owner && r.owner.department) || ''] : []),
      r.kickoff_date || '', r.end_date || '', r.status || '',
      r.users_in_scope != null ? r.users_in_scope : '',
      r.outcome || '', isOverdue(r) ? 'yes' : '',
      r.archived_at ? r.archived_at.slice(0, 10) : '',
      r.updated_at ? r.updated_at.slice(0, 10) : '',
    ];
    lines.push(cells.map(csvCell).join(','));
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pocs-${stamp}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Filas visibles según el toggle Archivadas (antes de filtros de texto/orden).
function visibleBase(admin) {
  const base = scopedRows(admin);
  return filters.archived ? base.filter((r) => r.archived_at) : base.filter((r) => !r.archived_at);
}

// ── Pintado de la tabla (sin refetch) ──────────────────────
function sortArrow(key) {
  if (sort.key !== key) return '<span class="sort-arrow"></span>';
  return `<span class="sort-arrow on">${sort.dir === 'asc' ? '▲' : '▼'}</span>`;
}
function th(key, label) {
  return `<div class="lt-c lt-sortable" data-sort="${key}">${label}${sortArrow(key)}</div>`;
}

function paint() {
  const admin = isAdmin();
  const body = document.getElementById('list-body');
  renderMetrics(admin);

  const cls = admin ? 'lt-row lt-admin' : 'lt-row';
  const rows = sortRows(applyFilters(visibleBase(admin)));

  if (!rows.length) {
    const msg = filters.archived
      ? pick('No archived PoCs.', 'No hay PoCs archivadas.')
      : (filters.q || filters.status || filters.verdict || filters.dept || filters.owner)
        ? pick('No PoCs match the filters.', 'Ninguna PoC coincide con los filtros.')
        : pick('No PoCs yet — create your first one.', 'Aún no hay PoCs — crea la primera.');
    body.innerHTML = `<div class="list-empty">${msg}</div>`;
    return;
  }

  const head = `<div class="${cls} lt-head">
      ${th('title', pick('PoC', 'PoC'))}
      ${admin ? th('owner', pick('Owner', 'Dueño')) + th('department', pick('Department', 'Departamento')) : ''}
      ${th('kickoff_date', pick('Kickoff', 'Kick-off'))}
      ${th('end_date', pick('End', 'Fin'))}
      ${th('status', pick('Status', 'Estado'))}
      ${th('users_in_scope', pick('Users', 'Usuarios'))}
      <div class="lt-c"></div>
    </div>`;

  const items = rows.map((r) => {
    const name = escHtml(r.title || r.company || pick('(untitled)', '(sin título)'));
    const sub = r.company && r.title && r.title !== r.company ? `<span class="lt-sub">${escHtml(r.company)}</span>` : '';
    let adminCols = '';
    if (admin) {
      const owner = r.owner || {};
      adminCols = `
        <div class="lt-c lt-name">${escHtml(ownerName(r) || '—')}<span class="lt-sub">${escHtml(owner.job_title || '—')}</span></div>
        <div class="lt-c">${deptLabel(owner.department)}</div>`;
    }
    const overdue = isOverdue(r);
    const endCell = `<div class="lt-c t-num${overdue ? ' overdue' : ''}">${fmtDate(r.end_date)}${overdue ? ` <span class="chip-overdue">${pick('Overdue', 'Vencida')}</span>` : ''}</div>`;

    let action = '';
    if (!isDemo()) {
      const ARCHIVE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v4H3z"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/></svg>';
      const RESTORE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/></svg>';
      if (filters.archived) {
        const left = daysUntilPurge(r);
        action = `<button class="lt-act" data-restore="${r.id}" title="${pick('Restore', 'Restaurar')}">${RESTORE_SVG}</button>`
          + `<span class="purge-note">${pick('deletes in', 'se borra en')} ${left}${pick('d', 'd')}</span>`;
      } else {
        action = `<button class="lt-act" data-archive="${r.id}" title="${pick('Archive', 'Archivar')}">${ARCHIVE_SVG}</button>`;
      }
    }

    return `<div class="${cls} lt-item${r.archived_at ? ' lt-archived' : ''}" data-id="${r.id}">
        <div class="lt-c lt-co">${monogram(r.title || r.company)}<span class="lt-name">${name}${sub}</span></div>
        ${adminCols}
        <div class="lt-c t-num">${fmtDate(r.kickoff_date)}</div>
        ${endCell}
        <div class="lt-c"><span class="badge" data-st="${r.status}">${statusLabel(r.status)}</span></div>
        <div class="lt-c t-num">${r.users_in_scope != null ? r.users_in_scope : '—'}</div>
        <div class="lt-c au-actions">${action}</div>
      </div>`;
  }).join('');

  body.innerHTML = head + items;

  // Abrir PoC al pinchar la fila (no en los botones de acción).
  body.querySelectorAll('.lt-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-archive],[data-restore]')) return;
      location.hash = '#/poc/' + el.dataset.id;
    });
  });
  // Orden por columnas.
  body.querySelectorAll('.lt-head [data-sort]').forEach((c) => {
    c.addEventListener('click', () => {
      const key = c.dataset.sort;
      if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else { sort.key = key; sort.dir = 'asc'; }
      paint();
    });
  });
  // Archivar / restaurar.
  body.querySelectorAll('[data-archive]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(pick(
        'Archive this PoC? It will be permanently deleted after 30 days (you can restore it before then).',
        '¿Archivar esta PoC? Se borrará permanentemente a los 30 días (puedes restaurarla antes).',
      ))) return;
      try {
        await archivePoc(btn.dataset.archive);
        const row = allRows.find((r) => r.id === btn.dataset.archive);
        if (row) row.archived_at = new Date().toISOString();
        paint();
      } catch (err) { alert(pick('Could not archive.', 'No se pudo archivar.')); }
    });
  });
  body.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await restorePoc(btn.dataset.restore);
        const row = allRows.find((r) => r.id === btn.dataset.restore);
        if (row) row.archived_at = null;
        paint();
      } catch (err) { alert(pick('Could not restore.', 'No se pudo restaurar.')); }
    });
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

  body.innerHTML = `<div class="list-loading">${pick('Loading…', 'Cargando…')}</div>`;
  try {
    allRows = await listPocs();
  } catch (e) {
    console.error(e);
    document.getElementById('listMetrics').hidden = true;
    document.getElementById('listToolbar').innerHTML = '';
    body.innerHTML = `<div class="list-empty">${pick('Could not load PoCs.', 'No se pudieron cargar las PoCs.')}</div>`;
    return;
  }

  renderToolbar(admin);
  paint();
}

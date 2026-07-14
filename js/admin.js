// Panel de administración: alta y gestión de usuarios.
// El alta usa la Edge Function admin-create-user (service_role en servidor);
// el navegador NUNCA maneja la service_role key.
import { sb } from './supabaseClient.js';
import { pick } from './i18n.js';
import { getProfile, isDemo } from './auth.js';
import { listOwners } from './hubspot.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Etiqueta visible del rol de acceso. El valor en BD sigue siendo 'ae' | 'admin';
// solo cambia el texto que ve el admin.
function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  return pick('Regular user', 'Usuario regular');
}

// Contraseña provisional robusta.
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '!@#$%&*?';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  out += specials[buf[12] % specials.length];
  out += (buf[13] % 90) + 10; // 2 dígitos
  return out;
}

async function invoke(fn, body) {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message || 'Error';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const j = await error.context.json();
        if (j && j.error) msg = j.error;
      }
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

let usersById = {};

async function listUsers() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, must_change_password, created_at, department, hubspot_owner_id, hubspot_owner_name')
    .order('created_at', { ascending: true });
  if (error) throw error;
  usersById = {};
  (data || []).forEach((u) => { usersById[u.id] = u; });
  return data;
}

function renderUsers(users) {
  const wrap = document.getElementById('admin-users');
  const me = getProfile();
  const demo = isDemo();
  const head = `<div class="lt-row has-ae lt-head">
      <div class="lt-c">${pick('Name', 'Nombre')}</div>
      <div class="lt-c">Email</div>
      <div class="lt-c">${pick('Role', 'Rol')}</div>
      <div class="lt-c">${pick('Status', 'Estado')}</div>
      <div class="lt-c"></div>
      <div class="lt-c"></div>
    </div>`;
  const rows = users.map((u) => {
    const inactive = u.is_active === false;
    const self = me && u.id === me.id;
    const activeLbl = inactive ? pick('Inactive', 'Inactivo') : pick('Active', 'Activo');
    return `<div class="lt-row has-ae ${inactive ? 'au-inactive' : ''}">
        <div class="lt-c lt-name">${escHtml(u.full_name || '—')}</div>
        <div class="lt-c">${escHtml(u.email)}</div>
        <div class="lt-c"><span class="au-role ${u.role}">${escHtml(roleLabel(u.role))}</span></div>
        <div class="lt-c">${activeLbl}${u.must_change_password ? ` · <span style="color:var(--amber)">${pick('temp pw', 'pw temp')}</span>` : ''}</div>
        <div class="lt-c au-actions">
          ${demo ? '' : `<button class="au-btn" data-edit="${u.id}">${pick('Edit', 'Editar')}</button>`}
          ${demo ? '' : `<button class="au-btn" data-reset="${u.id}" data-email="${escHtml(u.email)}">${pick('Reset pw', 'Reset pw')}</button>`}
        </div>
        <div class="lt-c au-actions">
          ${demo || self ? '' : `<button class="au-btn" data-toggle="${u.id}" data-active="${inactive ? '0' : '1'}">${inactive ? pick('Activate', 'Activar') : pick('Deactivate', 'Desactivar')}</button>`}
          ${(!demo && !self && inactive) ? `<button class="au-btn danger" data-delete="${u.id}" data-email="${escHtml(u.email)}">${pick('Delete', 'Borrar')}</button>` : ''}
        </div>
      </div>`;
  }).join('');
  wrap.innerHTML = head + rows;

  wrap.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEdit(btn.dataset.edit));
  });
  wrap.querySelectorAll('[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => resetPassword(btn.dataset.reset, btn.dataset.email));
  });
  wrap.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.toggle, btn.dataset.active === '1'));
  });
  wrap.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.delete, btn.dataset.email));
  });
}

function showOk(html) {
  const ok = document.getElementById('adminOk');
  ok.innerHTML = html;
  ok.hidden = false;
  document.getElementById('adminErr').hidden = true;
}
function showErr(msg) {
  const err = document.getElementById('adminErr');
  err.textContent = msg;
  err.hidden = false;
}

async function resetPassword(userId, email) {
  const pw = genPassword();
  if (!confirm(pick('Reset password for ', 'Restablecer contraseña de ') + email + '?')) return;
  try {
    await invoke('admin-user-action', { action: 'reset_password', user_id: userId, password: pw });
    showOk(`${pick('New provisional password for', 'Nueva contraseña provisional de')} <b>${escHtml(email)}</b>: <code>${escHtml(pw)}</code> — ${pick('they must change it on next login.', 'deberá cambiarla en el próximo inicio de sesión.')}`);
    loadAndRender();
  } catch (e) { showErr(e.message); }
}

async function toggleActive(userId, makeInactive) {
  try {
    await invoke('admin-user-action', { action: 'set_active', user_id: userId, is_active: !makeInactive });
    loadAndRender();
  } catch (e) { showErr(e.message); }
}

// Borra permanentemente un usuario desactivado (y sus datos, en cascada).
async function deleteUser(userId, email) {
  const msg = pick(
    'Permanently delete ' + email + ' and ALL their data (PoCs included)? This cannot be undone.',
    'Borrar permanentemente a ' + email + ' y TODOS sus datos (incluidas sus PoCs)? No se puede deshacer.',
  );
  if (!confirm(msg)) return;
  try {
    await invoke('admin-user-action', { action: 'delete_user', user_id: userId });
    loadAndRender();
  } catch (e) { showErr(e.message); }
}

async function loadAndRender() {
  const wrap = document.getElementById('admin-users');
  wrap.innerHTML = `<div class="list-loading">${pick('Loading…', 'Cargando…')}</div>`;
  try {
    renderUsers(await listUsers());
  } catch (e) {
    wrap.innerHTML = `<div class="list-empty">${pick('Could not load users.', 'No se pudieron cargar los usuarios.')}</div>`;
  }
}

// Owners de HubSpot (cache en memoria durante la vista admin).
let ownersCache = null;
async function loadOwnersCached() {
  if (!ownersCache) ownersCache = await listOwners();
  return ownersCache;
}
// Pinta "— Not linked —" + la lista de owners en un <select>, y fija el valor actual.
function renderOwnerOptions(sel, owners, currentId) {
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = pick('— Not linked —', '— Sin vincular —'); sel.appendChild(none);
  owners.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.id; opt.textContent = o.name; opt.dataset.name = o.name; sel.appendChild(opt);
  });
  sel.value = currentId || '';
}
function readOwner(sel) {
  if (!sel || !sel.value) return { id: null, name: null };
  const opt = sel.options[sel.selectedIndex];
  return { id: sel.value, name: (opt && opt.dataset.name) || null };
}
// Alta: rellena #nuHsOwner; oculta el campo si HubSpot no está disponible.
async function fillHsOwners() {
  const sel = document.getElementById('nuHsOwner');
  if (!sel) return;
  const field = sel.closest('.field');
  try {
    renderOwnerOptions(sel, await loadOwnersCached(), '');
    if (field) field.hidden = false;
  } catch (_e) {
    if (field) field.hidden = true;
  }
}

// ── Editar usuario (modal) ────────────────────────────────────
let editingId = null;
async function openEdit(userId) {
  const u = usersById[userId];
  if (!u) return;
  editingId = userId;
  const me = getProfile();
  document.getElementById('euEmail').textContent = u.email || '';
  document.getElementById('euName').value = u.full_name || '';
  const roleSel = document.getElementById('euRole');
  roleSel.value = u.role === 'admin' ? 'admin' : 'ae';
  roleSel.disabled = !!(me && me.id === userId); // no cambiar el propio rol (evita quedarse sin admin)
  document.getElementById('euDept').value = u.department || '';
  document.getElementById('euErr').hidden = true;
  const hsSel = document.getElementById('euHsOwner');
  const hsField = hsSel.closest('.field');
  try {
    renderOwnerOptions(hsSel, await loadOwnersCached(), u.hubspot_owner_id);
    if (hsField) hsField.hidden = false;
  } catch (_e) {
    if (hsField) hsField.hidden = true; // HubSpot no disponible: se edita el resto
  }
  document.getElementById('euOverlay').hidden = false;
}
function closeEdit() {
  editingId = null;
  document.getElementById('euOverlay').hidden = true;
}
async function saveEdit() {
  if (!editingId) return;
  const err = document.getElementById('euErr');
  err.hidden = true;
  const owner = readOwner(document.getElementById('euHsOwner'));
  const dept = document.getElementById('euDept').value || null;
  const upd = {
    full_name: document.getElementById('euName').value.trim(),
    role: document.getElementById('euRole').value === 'admin' ? 'admin' : 'ae',
    department: dept,
    hubspot_owner_id: owner.id,
    hubspot_owner_name: owner.name,
  };
  const btn = document.getElementById('euSave');
  btn.disabled = true;
  const { error } = await sb.from('profiles').update(upd).eq('id', editingId);
  btn.disabled = false;
  if (error) { err.textContent = error.message; err.hidden = false; return; }
  closeEdit();
  showOk(pick('User updated.', 'Usuario actualizado.'));
  loadAndRender();
}

let wired = false;
export async function renderAdmin() {
  if (!wired) {
    wired = true;
    document.getElementById('nuGen').addEventListener('click', () => {
      document.getElementById('nuPass').value = genPassword();
    });
    document.getElementById('nuCreate').addEventListener('click', createUser);
    document.getElementById('euCancel').addEventListener('click', closeEdit);
    document.getElementById('euSave').addEventListener('click', saveEdit);
    document.getElementById('euOverlay').addEventListener('click', (e) => { if (e.target.id === 'euOverlay') closeEdit(); });
  }
  document.getElementById('adminOk').hidden = true;
  document.getElementById('adminErr').hidden = true;
  fillHsOwners();
  await loadAndRender();
}

async function createUser() {
  const name = document.getElementById('nuName').value.trim();
  const email = document.getElementById('nuEmail').value.trim();
  const role = document.getElementById('nuRole').value;
  const department = document.getElementById('nuDept').value || null;
  const hsSel = document.getElementById('nuHsOwner');
  const hsId = hsSel && hsSel.value ? hsSel.value : null;
  const hsName = hsId ? (hsSel.options[hsSel.selectedIndex].dataset.name || null) : null;
  let pw = document.getElementById('nuPass').value.trim();
  if (!email) { showErr(pick('Email is required.', 'El correo es obligatorio.')); return; }
  if (!pw) pw = genPassword();
  if (pw.length < 8) { showErr(pick('Password must be at least 8 characters.', 'La contraseña debe tener al menos 8 caracteres.')); return; }

  // Modo demo: mostramos el flujo sin persistir nada.
  if (isDemo()) {
    showOk(`${pick('Demo mode', 'Modo demo')}: <b>${escHtml(email)}</b> ${pick('would be created with provisional password', 'se crearía con contraseña provisional')} <code>${escHtml(pw)}</code>. ${pick('Nothing was saved.', 'No se ha guardado nada.')}`);
    document.getElementById('nuName').value = '';
    document.getElementById('nuEmail').value = '';
    document.getElementById('nuPass').value = '';
    return;
  }

  const btn = document.getElementById('nuCreate');
  btn.disabled = true;
  try {
    await invoke('admin-create-user', { email, full_name: name, role, department, password: pw, hubspot_owner_id: hsId, hubspot_owner_name: hsName });
    showOk(`${pick('User created', 'Usuario creado')}: <b>${escHtml(email)}</b> — ${pick('provisional password', 'contraseña provisional')}: <code>${escHtml(pw)}</code>. ${pick('Share it securely; they must change it on first login.', 'Compártela de forma segura; deberá cambiarla al primer inicio de sesión.')}`);
    document.getElementById('nuName').value = '';
    document.getElementById('nuEmail').value = '';
    document.getElementById('nuPass').value = '';
    loadAndRender();
  } catch (e) {
    showErr(e.message);
  } finally {
    btn.disabled = false;
  }
}

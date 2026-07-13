// Panel de administración: alta y gestión de usuarios.
// El alta usa la Edge Function admin-create-user (service_role en servidor);
// el navegador NUNCA maneja la service_role key.
import { sb } from './supabaseClient.js';
import { pick } from './i18n.js';
import { getProfile } from './auth.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

async function listUsers() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, must_change_password, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

function renderUsers(users) {
  const wrap = document.getElementById('admin-users');
  const me = getProfile();
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
        <div class="lt-c"><span class="au-role ${u.role}">${u.role}</span></div>
        <div class="lt-c">${activeLbl}${u.must_change_password ? ` · <span style="color:var(--amber)">${pick('temp pw', 'pw temp')}</span>` : ''}</div>
        <div class="lt-c au-actions">
          <button class="au-btn" data-reset="${u.id}" data-email="${escHtml(u.email)}">${pick('Reset pw', 'Reset pw')}</button>
        </div>
        <div class="lt-c au-actions">
          ${self ? '' : `<button class="au-btn danger" data-toggle="${u.id}" data-active="${inactive ? '0' : '1'}">${inactive ? pick('Activate', 'Activar') : pick('Deactivate', 'Desactivar')}</button>`}
        </div>
      </div>`;
  }).join('');
  wrap.innerHTML = head + rows;

  wrap.querySelectorAll('[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => resetPassword(btn.dataset.reset, btn.dataset.email));
  });
  wrap.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.toggle, btn.dataset.active === '1'));
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

async function loadAndRender() {
  const wrap = document.getElementById('admin-users');
  wrap.innerHTML = `<div class="list-loading">${pick('Loading…', 'Cargando…')}</div>`;
  try {
    renderUsers(await listUsers());
  } catch (e) {
    wrap.innerHTML = `<div class="list-empty">${pick('Could not load users.', 'No se pudieron cargar los usuarios.')}</div>`;
  }
}

let wired = false;
export async function renderAdmin() {
  if (!wired) {
    wired = true;
    document.getElementById('nuGen').addEventListener('click', () => {
      document.getElementById('nuPass').value = genPassword();
    });
    document.getElementById('nuCreate').addEventListener('click', createUser);
  }
  document.getElementById('adminOk').hidden = true;
  document.getElementById('adminErr').hidden = true;
  await loadAndRender();
}

async function createUser() {
  const name = document.getElementById('nuName').value.trim();
  const email = document.getElementById('nuEmail').value.trim();
  const role = document.getElementById('nuRole').value;
  let pw = document.getElementById('nuPass').value.trim();
  if (!email) { showErr(pick('Email is required.', 'El correo es obligatorio.')); return; }
  if (!pw) pw = genPassword();
  if (pw.length < 8) { showErr(pick('Password must be at least 8 characters.', 'La contraseña debe tener al menos 8 caracteres.')); return; }

  const btn = document.getElementById('nuCreate');
  btn.disabled = true;
  try {
    await invoke('admin-create-user', { email, full_name: name, role, password: pw });
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

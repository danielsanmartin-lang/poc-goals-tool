// Onboarding (primer acceso) y perfil del usuario.
//
// Regular user: sus datos (email, nombre, puesto, departamento) son de SOLO
// lectura — los gestiona el admin. Solo puede cambiar su contraseña y el idioma.
//
// Admin: puede editar su propio email, nombre, puesto y departamento desde su
// perfil. El email cambia la identidad de login, así que la escritura va por la
// Edge Function admin-user-action (service_role); el puesto/departamento/nombre
// también, en la misma llamada parcial.
import { sb } from './supabaseClient.js';
import { pick, getLang } from './i18n.js';
import { getProfile, loadProfile, changePassword, isAdmin } from './auth.js';
import { DEPARTMENTS, JOB_TITLES, JOB_TITLE_OTHER } from './data.js';

function deptLabel(id) {
  const d = DEPARTMENTS.find((x) => x.id === id);
  return d ? pick(d.en, d.es) : '';
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

// ── Constructores de campos ──────────────────────────────────
function makeField(labelText, control) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = labelText;
  f.appendChild(l);
  f.appendChild(control);
  return f;
}
function roInput(value) {
  const i = document.createElement('input');
  i.value = value;
  i.disabled = true;
  return i;
}
function textInput(value) {
  const i = document.createElement('input');
  i.value = value || '';
  return i;
}
function jobSelect(current) {
  const sel = document.createElement('select');
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = pick('— Select —', '— Elegir —'); sel.appendChild(ph);
  JOB_TITLES.forEach((t) => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
  });
  const other = document.createElement('option');
  other.value = JOB_TITLE_OTHER; other.textContent = pick('Other', 'Otro'); sel.appendChild(other);
  if (current && JOB_TITLES.includes(current)) sel.value = current;
  else if (current) sel.value = JOB_TITLE_OTHER;
  else sel.value = '';
  return sel;
}
function deptSelect(current) {
  const sel = document.createElement('select');
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = pick('— Select —', '— Elegir —'); sel.appendChild(ph);
  DEPARTMENTS.forEach((d) => {
    const o = document.createElement('option'); o.value = d.id; o.textContent = pick(d.en, d.es); sel.appendChild(o);
  });
  sel.value = current || '';
  return sel;
}

// Referencias a los controles editables del admin (para leerlos al guardar).
let adminFields = null;

function buildDetailsBody(p, admin) {
  const body = document.getElementById('profDetailsBody');
  body.innerHTML = '';
  adminFields = null;

  if (!admin) {
    body.appendChild(makeField('Email', roInput(p.email || '')));
    body.appendChild(makeField(pick('Full name', 'Nombre completo'), roInput(p.full_name || '')));
    body.appendChild(makeField(pick('Job title', 'Puesto de trabajo'), roInput(p.job_title || '—')));
    body.appendChild(makeField(pick('Department', 'Departamento'), roInput(deptLabel(p.department) || '—')));
    return;
  }

  // Admin: campos editables.
  const emailEl = textInput(p.email || '');
  const nameEl = textInput(p.full_name || '');
  const jobEl = jobSelect(p.job_title);
  const deptEl = deptSelect(p.department);

  const otherWrap = document.createElement('div');
  otherWrap.className = 'field';
  otherWrap.hidden = jobEl.value !== JOB_TITLE_OTHER;
  const otherLbl = document.createElement('label');
  otherLbl.textContent = pick('Specify job title', 'Especifica el puesto');
  const otherInput = document.createElement('input');
  otherInput.value = (p.job_title && !JOB_TITLES.includes(p.job_title)) ? p.job_title : '';
  otherWrap.appendChild(otherLbl); otherWrap.appendChild(otherInput);
  jobEl.onchange = () => { otherWrap.hidden = jobEl.value !== JOB_TITLE_OTHER; };

  body.appendChild(makeField('Email', emailEl));
  body.appendChild(makeField(pick('Full name', 'Nombre completo'), nameEl));
  body.appendChild(makeField(pick('Job title', 'Puesto de trabajo'), jobEl));
  body.appendChild(otherWrap);
  body.appendChild(makeField(pick('Department', 'Departamento'), deptEl));

  const err = document.createElement('div');
  err.className = 'auth-err'; err.hidden = true;
  const ok = document.createElement('div');
  ok.className = 'admin-ok'; ok.hidden = true;
  const btn = document.createElement('button');
  btn.className = 'xbtn'; btn.style.marginTop = '4px';
  btn.textContent = pick('Save changes', 'Guardar cambios');
  body.appendChild(err); body.appendChild(ok); body.appendChild(btn);

  adminFields = { emailEl, nameEl, jobEl, otherInput, deptEl, err, ok, btn };
  btn.onclick = saveDetails;
}

async function saveDetails() {
  if (!adminFields) return;
  const { emailEl, nameEl, jobEl, otherInput, deptEl, err, ok, btn } = adminFields;
  err.hidden = true; ok.hidden = true;
  const email = emailEl.value.trim().toLowerCase();
  const full_name = nameEl.value.trim();
  const job_title = (jobEl.value === JOB_TITLE_OTHER ? otherInput.value.trim() : jobEl.value) || null;
  const department = deptEl.value || null;

  if (!full_name) { err.textContent = pick('Name is required.', 'El nombre es obligatorio.'); err.hidden = false; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = pick('Enter a valid email.', 'Introduce un email válido.'); err.hidden = false; return; }

  btn.disabled = true;
  try {
    const p = getProfile();
    await invoke('admin-user-action', {
      action: 'update_profile', user_id: p.id, email, full_name, job_title, department,
    });
    await loadProfile();
    renderProfile();
    if (_hooks.afterSave) _hooks.afterSave();
    const okEl = adminFields && adminFields.ok;
    if (okEl) { okEl.textContent = pick('Profile updated.', 'Perfil actualizado.'); okEl.hidden = false; }
  } catch (e) {
    err.textContent = e.message; err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

export function renderSetup() {
  const p = getProfile() || {};
  document.getElementById('setupName').value = p.full_name || '';
  document.getElementById('setupErr').hidden = true;
}

export function renderProfile() {
  const p = getProfile() || {};
  const admin = isAdmin();
  const hsub = document.querySelector('#view-profile .list-hsub');
  if (hsub) {
    hsub.textContent = admin
      ? pick('Manage your account details, password and language.', 'Gestiona los datos de tu cuenta, la contraseña y el idioma.')
      : pick('Your details are set by your admin. Here you can change your password and language.', 'Tus datos los gestiona tu administrador. Aquí puedes cambiar tu contraseña y el idioma.');
  }
  buildDetailsBody(p, admin);
  // Estado del selector de idioma
  document.querySelectorAll('#profLang .lbtn').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === getLang());
  });
  // Limpiar el formulario de contraseña
  document.getElementById('profPwNew').value = '';
  document.getElementById('profPwConfirm').value = '';
  document.getElementById('profErr').hidden = true;
  document.getElementById('profOk').hidden = true;
}

let wired = false;
let _hooks = {};
// hooks: { afterSetup, afterSave }
export function initProfileForms(hooks) {
  _hooks = hooks || {};
  if (wired) return;
  wired = true;

  // Onboarding: el usuario solo confirma su nombre; el resto lo fijó el admin.
  document.getElementById('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('setupErr');
    err.hidden = true;
    const name = document.getElementById('setupName').value.trim();
    if (!name) { err.textContent = pick('Name is required.', 'El nombre es obligatorio.'); err.hidden = false; return; }
    const btn = document.getElementById('setupBtn');
    btn.disabled = true;
    const p = getProfile();
    const { error } = await sb.from('profiles').update({ full_name: name, profile_completed: true }).eq('id', p.id);
    btn.disabled = false;
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await _hooks.afterSetup();
  });

  // Perfil: cambio de contraseña (disponible para todos los usuarios).
  document.getElementById('profPwSave').addEventListener('click', async () => {
    const err = document.getElementById('profErr');
    const ok = document.getElementById('profOk');
    err.hidden = true; ok.hidden = true;
    const p1 = document.getElementById('profPwNew').value;
    const p2 = document.getElementById('profPwConfirm').value;
    if (p1.length < 8) { err.textContent = pick('Password must be at least 8 characters.', 'Mínimo 8 caracteres.'); err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = pick('Passwords do not match.', 'Las contraseñas no coinciden.'); err.hidden = false; return; }
    const btn = document.getElementById('profPwSave');
    btn.disabled = true;
    const { error } = await changePassword(p1);
    btn.disabled = false;
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await loadProfile();
    document.getElementById('profPwNew').value = '';
    document.getElementById('profPwConfirm').value = '';
    ok.textContent = pick('Password updated.', 'Contraseña actualizada.');
    ok.hidden = false;
  });
}

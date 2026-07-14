// Onboarding (primer acceso) y edición de perfil.
// El usuario solo edita su nombre y su puesto (job_title). El departamento y el
// vínculo con HubSpot los gestiona el admin (alta / panel de administración).
import { sb } from './supabaseClient.js';
import { pick } from './i18n.js';
import { getProfile, loadProfile } from './auth.js';
import { JOB_TITLES, JOB_TITLE_OTHER } from './data.js';

function fillRoleSelect(sel) {
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = pick('— Select —', '— Elegir —'); sel.appendChild(ph);
  JOB_TITLES.forEach((t) => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
  });
  const other = document.createElement('option');
  other.value = JOB_TITLE_OTHER; other.textContent = pick('Other', 'Otro'); sel.appendChild(other);
}

// Coloca el valor guardado en el desplegable de puesto: si no está en la lista → "Otro" + texto.
function setRoleControls(sel, wrap, otherInput, value) {
  if (value && JOB_TITLES.includes(value)) { sel.value = value; wrap.hidden = true; otherInput.value = ''; }
  else if (value) { sel.value = JOB_TITLE_OTHER; wrap.hidden = false; otherInput.value = value; }
  else { sel.value = ''; wrap.hidden = true; otherInput.value = ''; }
}
function readRole(sel, otherInput) {
  return sel.value === JOB_TITLE_OTHER ? otherInput.value.trim() : sel.value;
}

export function renderSetup() {
  const p = getProfile() || {};
  fillRoleSelect(document.getElementById('setupRole'));
  document.getElementById('setupName').value = p.full_name || '';
  setRoleControls(document.getElementById('setupRole'), document.getElementById('setupOtherWrap'), document.getElementById('setupOther'), p.job_title);
  document.getElementById('setupErr').hidden = true;
}

export function renderProfile() {
  const p = getProfile() || {};
  fillRoleSelect(document.getElementById('profRole'));
  document.getElementById('profEmail').value = p.email || '';
  document.getElementById('profName').value = p.full_name || '';
  setRoleControls(document.getElementById('profRole'), document.getElementById('profOtherWrap'), document.getElementById('profOther'), p.job_title);
  document.getElementById('profErr').hidden = true;
  document.getElementById('profOk').hidden = true;
}

async function saveFields({ name, jobTitle, completed }) {
  const p = getProfile();
  const upd = { full_name: name, job_title: jobTitle };
  if (completed) upd.profile_completed = true;
  const { error } = await sb.from('profiles').update(upd).eq('id', p.id);
  return error;
}

let wired = false;
// hooks: { afterSetup, afterProfileSave }
export function initProfileForms(hooks) {
  if (wired) return;
  wired = true;

  document.getElementById('setupRole').addEventListener('change', (e) => {
    document.getElementById('setupOtherWrap').hidden = e.target.value !== JOB_TITLE_OTHER;
  });
  document.getElementById('profRole').addEventListener('change', (e) => {
    document.getElementById('profOtherWrap').hidden = e.target.value !== JOB_TITLE_OTHER;
  });

  document.getElementById('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('setupErr');
    err.hidden = true;
    const name = document.getElementById('setupName').value.trim();
    const jobTitle = readRole(document.getElementById('setupRole'), document.getElementById('setupOther'));
    if (!name) { err.textContent = pick('Name is required.', 'El nombre es obligatorio.'); err.hidden = false; return; }
    if (!jobTitle) { err.textContent = pick('Please choose or specify your role.', 'Elige o especifica tu rol.'); err.hidden = false; return; }
    const btn = document.getElementById('setupBtn');
    btn.disabled = true;
    const error = await saveFields({ name, jobTitle, completed: true });
    btn.disabled = false;
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await hooks.afterSetup();
  });

  document.getElementById('profSave').addEventListener('click', async () => {
    const err = document.getElementById('profErr');
    const ok = document.getElementById('profOk');
    err.hidden = true; ok.hidden = true;
    const name = document.getElementById('profName').value.trim();
    const jobTitle = readRole(document.getElementById('profRole'), document.getElementById('profOther'));
    if (!name) { err.textContent = pick('Name is required.', 'El nombre es obligatorio.'); err.hidden = false; return; }
    if (!jobTitle) { err.textContent = pick('Please choose or specify your role.', 'Elige o especifica tu rol.'); err.hidden = false; return; }
    const btn = document.getElementById('profSave');
    btn.disabled = true;
    const error = await saveFields({ name, jobTitle, completed: false });
    btn.disabled = false;
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await loadProfile();
    ok.textContent = pick('Profile updated.', 'Perfil actualizado.');
    ok.hidden = false;
    if (hooks.afterProfileSave) hooks.afterProfileSave();
  });
}

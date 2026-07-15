// Onboarding (primer acceso) y perfil del usuario.
// El puesto (job_title), el departamento y el vínculo con HubSpot los gestiona
// SOLO el admin (alta / panel de administración). En el onboarding el usuario
// únicamente confirma su nombre; en su perfil sus datos son de solo lectura y
// solo puede cambiar la contraseña y el idioma.
import { sb } from './supabaseClient.js';
import { pick, getLang } from './i18n.js';
import { getProfile, loadProfile, changePassword } from './auth.js';
import { DEPARTMENTS } from './data.js';

function deptLabel(id) {
  const d = DEPARTMENTS.find((x) => x.id === id);
  return d ? pick(d.en, d.es) : '';
}

export function renderSetup() {
  const p = getProfile() || {};
  document.getElementById('setupName').value = p.full_name || '';
  document.getElementById('setupErr').hidden = true;
}

export function renderProfile() {
  const p = getProfile() || {};
  document.getElementById('profEmail').value = p.email || '';
  document.getElementById('profName').value = p.full_name || '';
  document.getElementById('profJob').value = p.job_title || '—';
  document.getElementById('profDept').value = deptLabel(p.department) || '—';
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
// hooks: { afterSetup }
export function initProfileForms(hooks) {
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
    await hooks.afterSetup();
  });

  // Perfil: cambio de contraseña (única acción de escritura del usuario).
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

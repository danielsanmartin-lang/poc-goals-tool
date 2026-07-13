// Arranque de la app: sesión, routing y chrome (topbar, login, cambio de pw).
import { setLang, applyStatic, getLang, pick } from './i18n.js';
import { getPoc } from './state.js';
import { loadProfile, signIn, signOut, changePassword, getProfile, isAdmin, onAuthChange } from './auth.js';
import { mountFormOnce, saveNow, updateSummary, setOnSaved } from './form.js';
import { route, initRouter } from './router.js';
import { renderList } from './list.js';
import { renderAdmin } from './admin.js';

function updateChrome() {
  const p = getProfile();
  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = p ? p.email : '';
  const adminBtn = document.getElementById('navAdmin');
  if (adminBtn) adminBtn.hidden = !isAdmin();
}

function exportPDF() {
  updateSummary();
  const co = getPoc().company || 'PoC';
  document.title = 'PoC Kickoff Agreement — ' + co + ' — Zepo';
  window.print();
}

function wireChrome() {
  document.querySelectorAll('.lbtn').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  document.getElementById('navList').addEventListener('click', () => { location.hash = '#/list'; });
  document.getElementById('navNew').addEventListener('click', () => { location.hash = '#/new'; });
  document.getElementById('navAdmin').addEventListener('click', () => { location.hash = '#/admin'; });
  document.getElementById('listNew').addEventListener('click', () => { location.hash = '#/new'; });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
    updateChrome();
    location.hash = '';
    route();
  });

  document.getElementById('saveBtn').addEventListener('click', () => saveNow());
  document.querySelectorAll('[data-action="export"]').forEach((b) => b.addEventListener('click', exportPDF));

  // Indicador de guardado (manual + autosave)
  setOnSaved((ok) => {
    const lbl = document.getElementById('saveLbl');
    if (!lbl) return;
    const original = pick('Save', 'Guardar');
    lbl.textContent = ok ? (getLang() === 'es' ? '✓ Guardado' : '✓ Saved') : (getLang() === 'es' ? '⚠ Error' : '⚠ Error');
    setTimeout(() => { lbl.textContent = original; }, 1600);
  });

  // Login
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('loginErr');
    const btn = document.getElementById('loginBtn');
    err.hidden = true;
    btn.disabled = true;
    const { error } = await signIn(
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPassword').value,
    );
    btn.disabled = false;
    if (error) {
      err.textContent = pick('Invalid email or password.', 'Correo o contraseña incorrectos.');
      err.hidden = false;
      return;
    }
    document.getElementById('loginPassword').value = '';
    updateChrome();
    location.hash = '#/list';
    route();
  });

  // Cambio de contraseña provisional
  document.getElementById('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('pwErr');
    const btn = document.getElementById('pwBtn');
    err.hidden = true;
    const p1 = document.getElementById('pwNew').value;
    const p2 = document.getElementById('pwConfirm').value;
    if (p1.length < 8) { err.textContent = pick('Password must be at least 8 characters.', 'Mínimo 8 caracteres.'); err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = pick('Passwords do not match.', 'Las contraseñas no coinciden.'); err.hidden = false; return; }
    btn.disabled = true;
    const { error } = await changePassword(p1);
    btn.disabled = false;
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await loadProfile();
    document.getElementById('pwNew').value = '';
    document.getElementById('pwConfirm').value = '';
    location.hash = '#/list';
    route();
  });

  // Re-render de vistas dinámicas al cambiar idioma (el formulario se re-renderiza solo)
  document.addEventListener('langchange', () => {});
}

async function init() {
  applyStatic();
  wireChrome();
  mountFormOnce();
  initRouter();

  // Re-render list/admin al cambiar idioma
  const { onLangChange } = await import('./i18n.js');
  onLangChange(() => {
    const v = document.body.dataset.view;
    if (v === 'list') renderList();
    else if (v === 'admin') renderAdmin();
  });

  onAuthChange((event) => {
    if (event === 'SIGNED_OUT') {
      updateChrome();
      route();
    }
  });

  await loadProfile();
  updateChrome();
  route();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

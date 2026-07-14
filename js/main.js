// Arranque de la app: sesión, routing y chrome (topbar, login, cambio de pw,
// onboarding de perfil, toggles de contraseña).
import { setLang, applyStatic, getLang, pick, onLangChange } from './i18n.js';
import { getPoc } from './state.js';
import { loadProfile, signIn, signOut, changePassword, getProfile, isAdmin, isDemo, onAuthChange } from './auth.js';
import { mountFormOnce, saveNow, setOnSaved } from './form.js';
import { route, initRouter } from './router.js';
import { renderList } from './list.js';
import { renderAdmin } from './admin.js';
import { initProfileForms, renderSetup, renderProfile } from './profile.js';
import { mountDealPicker } from './dealpicker.js';
import { exportToDeal } from './hubspot.js';

function updateChrome() {
  const p = getProfile();
  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = p ? p.email : '';
  const adminBtn = document.getElementById('navAdmin');
  if (adminBtn) adminBtn.hidden = !isAdmin();
  const demoBadge = document.getElementById('demoBadge');
  if (demoBadge) demoBadge.hidden = !isDemo();
}

function exportPDF() {
  const co = getPoc().company || 'PoC';
  document.title = 'PoC Kickoff Agreement — ' + co + ' — Zepo';
  window.print();
}

// Genera el PDF de la PoC (con html2pdf) y lo sube al deal enlazado en HubSpot.
async function exportToHubspot() {
  const poc = getPoc();
  if (!poc.id) { showToast(pick('Save the PoC first.', 'Guarda la PoC primero.')); return; }
  if (!poc.deal_id) { showToast(pick('Link a HubSpot deal first.', 'Enlaza un deal de HubSpot primero.')); return; }
  if (typeof window.html2pdf === 'undefined') { showToast('⚠ html2pdf ' + pick('not loaded', 'no cargado')); return; }

  const btn = document.getElementById('formExportHs');
  const view = document.getElementById('view-poc');
  if (btn) btn.disabled = true;
  view.classList.add('exporting'); // oculta controles durante la captura
  try {
    const safeCo = (poc.company || 'Zepo').replace(/[^\w.\- ]+/g, '_').trim();
    const filename = `PoC-${safeCo}.pdf`;
    const opt = {
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    const dataUri = await window.html2pdf().set(opt).from(view).outputPdf('datauristring');
    const b64 = String(dataUri).split(',')[1] || '';
    await exportToDeal(poc.id, filename, b64);
    showToast(pick('Exported to HubSpot ✓', 'Exportado a HubSpot ✓'));
  } catch (e) {
    showToast('⚠ ' + (e.message || 'Error'));
  } finally {
    view.classList.remove('exporting');
    if (btn) btn.disabled = false;
  }
}

// Aviso flotante de confirmación (se mantiene aunque cambie de vista).
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `<span class="tk">✓</span> ${msg}`;
  // reflow para reanimar si ya estaba visible
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── medidor de fortaleza ──────────────────────────────────
function pwScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
function updateMeter() {
  const meter = document.getElementById('pwMeter');
  const lbl = document.getElementById('pwMeterLbl');
  if (!meter) return;
  const score = pwScore(document.getElementById('pwNew').value);
  meter.dataset.score = String(score);
  const labels = {
    0: '',
    1: pick('Weak', 'Débil'),
    2: pick('Fair', 'Media'),
    3: pick('Good', 'Buena'),
    4: pick('Strong', 'Fuerte'),
  };
  lbl.textContent = labels[score];
}

// Iconos line-art monocromos (heredan color con currentColor)
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function wirePasswordEyes() {
  document.querySelectorAll('.pw-eye').forEach((btn) => {
    btn.innerHTML = EYE_SVG;
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('on', show);
      btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
    });
  });
}

function wireChrome() {
  document.querySelectorAll('.lbtn').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  document.getElementById('navHome').addEventListener('click', () => { location.hash = '#/list'; });
  document.getElementById('navProfile').addEventListener('click', () => { location.hash = '#/profile'; });
  document.getElementById('navAdmin').addEventListener('click', () => { location.hash = '#/admin'; });
  document.getElementById('listNew').addEventListener('click', () => { location.hash = '#/new'; });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
    updateChrome();
    location.hash = '';
    route();
  });

  // Botones del formulario de PoC
  document.getElementById('formSave').addEventListener('click', () => saveNow());
  document.getElementById('formExport').addEventListener('click', exportPDF);
  document.getElementById('formExportHs').addEventListener('click', exportToHubspot);
  setOnSaved((ok) => {
    const lbl = document.getElementById('formSaveLbl');
    if (!lbl) return;
    const original = pick('Save', 'Guardar');
    lbl.textContent = ok ? (getLang() === 'es' ? '✓ Guardado' : '✓ Saved') : '⚠ Error';
    setTimeout(() => { lbl.textContent = original; }, 1600);
  });

  wirePasswordEyes();

  // Medidor de fortaleza en el cambio de contraseña
  const pwNew = document.getElementById('pwNew');
  if (pwNew) pwNew.addEventListener('input', updateMeter);

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
    document.getElementById('pwMeter').dataset.score = '0';
    document.getElementById('pwMeterLbl').textContent = '';
    updateChrome();
    route();
    showToast(pick('Password changed successfully.', 'Contraseña cambiada correctamente.'));
  });

  // Onboarding + perfil
  initProfileForms({
    afterSetup: async () => { await loadProfile(); updateChrome(); location.hash = '#/list'; route(); },
    afterProfileSave: () => { updateChrome(); },
  });
}

async function init() {
  applyStatic();
  wireChrome();
  mountFormOnce();
  mountDealPicker();
  initRouter();

  onLangChange(() => {
    const v = document.body.dataset.view;
    if (v === 'list') renderList();
    else if (v === 'admin') renderAdmin();
    else if (v === 'setup') renderSetup();
    else if (v === 'profile') renderProfile();
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

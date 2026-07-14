// Router hash: #/list · #/new · #/poc/<id> · #/admin · #/profile
// Gates de acceso: sin sesión → login; contraseña provisional → pwchange;
// perfil sin completar → setup; #/admin solo admins.
import { getProfile, isAdmin } from './auth.js';
import { emptyPoc, setPoc, getPoc } from './state.js';
import { getPocById } from './persistence.js';
import { renderForm } from './form.js';
import { renderList } from './list.js';
import { renderAdmin } from './admin.js';
import { renderSetup, renderProfile } from './profile.js';
import { openDealPicker, hideDealPicker } from './dealpicker.js';

const VIEWS = ['login', 'pwchange', 'setup', 'list', 'poc', 'admin', 'profile'];
const AUTH_VIEWS = ['login', 'pwchange', 'setup'];

function show(view) {
  VIEWS.forEach((v) => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  const tb = document.getElementById('topbar');
  if (tb) tb.style.display = AUTH_VIEWS.includes(view) ? 'none' : '';
  document.body.dataset.view = view;
}

export async function route() {
  const profile = getProfile();

  if (!profile) { show('login'); return; }
  if (profile.must_change_password) { show('pwchange'); return; }
  if (!profile.profile_completed) { show('setup'); renderSetup(); return; }

  const h = location.hash || '#/list';

  if (h === '#/new') {
    const poc = setPoc(emptyPoc());
    poc.ae = profile.full_name || '';
    show('poc');
    renderForm();
    openDealPicker();
    return;
  }
  if (h.startsWith('#/poc/')) {
    const id = h.slice('#/poc/'.length);
    show('poc');
    hideDealPicker();
    try {
      setPoc(await getPocById(id));
      renderForm();
    } catch (e) {
      console.error(e);
      location.hash = '#/list';
    }
    return;
  }
  if (h === '#/admin') {
    if (!isAdmin()) { location.hash = '#/list'; return; }
    show('admin');
    renderAdmin();
    return;
  }
  if (h === '#/profile') {
    show('profile');
    renderProfile();
    return;
  }
  // default
  show('list');
  renderList();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
}

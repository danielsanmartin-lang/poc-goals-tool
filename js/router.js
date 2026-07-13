// Router hash mínimo: #/list · #/new · #/poc/<id> · #/admin
// Gates de acceso: sin sesión → login; con contraseña provisional → cambio;
// #/admin solo para admins.
import { getProfile, isAdmin } from './auth.js';
import { emptyPoc, setPoc } from './state.js';
import { getPocById } from './persistence.js';
import { renderForm } from './form.js';
import { renderList } from './list.js';
import { renderAdmin } from './admin.js';

const VIEWS = ['login', 'pwchange', 'list', 'poc', 'admin'];

function show(view) {
  VIEWS.forEach((v) => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  const tb = document.getElementById('topbar');
  if (tb) tb.style.display = (view === 'login' || view === 'pwchange') ? 'none' : '';
  document.body.dataset.view = view;
}

export async function route() {
  const profile = getProfile();

  if (!profile) { show('login'); return; }
  if (profile.must_change_password) { show('pwchange'); return; }

  const h = location.hash || '#/list';

  if (h === '#/new') {
    setPoc(emptyPoc());
    show('poc');
    renderForm();
    return;
  }
  if (h.startsWith('#/poc/')) {
    const id = h.slice('#/poc/'.length);
    show('poc');
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
  // default
  show('list');
  renderList();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
}

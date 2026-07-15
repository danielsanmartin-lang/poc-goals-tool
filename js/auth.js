// Autenticación y perfil del usuario en sesión.
import { sb } from './supabaseClient.js';

let _profile = null;

export function getProfile() {
  return _profile;
}

export function isAdmin() {
  return !!_profile && _profile.role === 'admin';
}

// Usuario de demostración: la app funciona en modo solo-lectura para él.
export function isDemo() {
  return !!_profile && _profile.is_demo === true;
}

// Carga (o recarga) el perfil del usuario en sesión. Devuelve null si no hay
// sesión o si el usuario está desactivado.
export async function loadProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    _profile = null;
    return null;
  }
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role, must_change_password, is_active, job_title, department, profile_completed, is_demo, hubspot_owner_id, hubspot_owner_name, language')
    .eq('id', user.id)
    .single();
  if (error || !data || data.is_active === false) {
    _profile = null;
    return null;
  }
  _profile = data;
  return _profile;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error };
  await loadProfile();
  return {};
}

export async function signOut() {
  _profile = null;
  await sb.auth.signOut();
}

// Cambia la contraseña y limpia el flag must_change_password.
export async function changePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { error };
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    await sb.from('profiles').update({ must_change_password: false }).eq('id', user.id);
    if (_profile) _profile.must_change_password = false;
  }
  return {};
}

// Guarda el idioma preferido en el perfil (persistente y entre dispositivos).
// Sin sesión no hace nada en BD; la continuidad en el mismo dispositivo la da
// localStorage (i18n.setLang). RLS profiles_update_self permite el auto-cambio.
export async function saveLanguage(lang) {
  const l = lang === 'es' ? 'es' : 'en';
  if (!_profile) return {};
  _profile.language = l;
  const { error } = await sb.from('profiles').update({ language: l }).eq('id', _profile.id);
  return { error };
}

// Reacciona a cambios de sesión (login/logout en otra pestaña, expiración…).
export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((event) => cb(event));
}

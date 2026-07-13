// Cliente Supabase único para toda la app.
// El SDK se carga como bundle UMD vendorizado (js/vendor/supabase.js) mediante
// un <script> clásico en index.html, que expone window.supabase antes de que
// se ejecuten los módulos (los módulos son `defer` por defecto).
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

if (!window.supabase || !window.supabase.createClient) {
  throw new Error('Supabase SDK no cargado: revisa js/vendor/supabase.js en index.html');
}

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

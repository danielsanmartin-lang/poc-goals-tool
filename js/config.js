// Configuración pública del cliente. Estas claves son PÚBLICAS por diseño
// (van en el navegador). La seguridad real está en RLS + Auth + Edge Function,
// nunca en ocultar estos valores. NUNCA pongas aquí la service_role key.
export const SUPABASE_URL = 'https://ncjaspbalcgzxjsqqafx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_i3RRP3BK4mbcaRWl-_IGdg_qNQ-YRrY';

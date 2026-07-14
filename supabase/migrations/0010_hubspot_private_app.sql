-- ─────────────────────────────────────────────────────────────
-- HubSpot: cambio de OAuth por usuario → token de Private App compartido.
-- El token (con scopes de solo lectura de deals/contactos/owners + files + notes)
-- vive como secreto del runtime de las Edge Functions (HUBSPOT_TOKEN), nunca en
-- el navegador. La identidad HubSpot de cada usuario se guarda como su owner id
-- en profiles (lo elige el usuario en su perfil, o el admin al crearlo).
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists hubspot_owner_id   text,
  add column if not exists hubspot_owner_name text;

-- Ya no usamos el flujo OAuth por usuario (tablas vacías creadas en 0009).
drop table if exists public.hubspot_oauth_states;
drop table if exists public.hubspot_connections;

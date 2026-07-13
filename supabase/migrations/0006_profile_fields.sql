-- Campos de perfil que el usuario rellena en su primer acceso (onboarding):
--   · job_title  — puesto (desplegable con opción libre "Otro")
--   · department — Sales / Partners
--   · profile_completed — gate del onboarding (false hasta que lo completa)
-- RLS: no cambia. profiles_update_self ya permite que cada uno edite su fila;
-- el guard sigue protegiendo solo role/is_active, así que estos campos son
-- editables por el propio usuario.
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists department text check (department in ('sales','partners')),
  add column if not exists profile_completed boolean not null default false;

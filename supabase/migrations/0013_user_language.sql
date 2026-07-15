-- ─────────────────────────────────────────────────────────────
-- Idioma preferido del usuario (EN/ES), persistente y por-usuario.
--  · Se guarda en el perfil para que la preferencia siga al usuario entre
--    dispositivos y sesiones (no solo localStorage).
--  · El guard NO lo congela: cada usuario (regular o admin) puede cambiar su
--    propio idioma vía profiles_update_self.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists language text not null default 'en'
    check (language in ('en','es'));

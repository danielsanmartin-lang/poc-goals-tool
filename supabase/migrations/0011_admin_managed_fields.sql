-- ─────────────────────────────────────────────────────────────
-- Departamento y usuario de HubSpot pasan a ser SOLO de admin.
--  · El guard congela department + hubspot_owner_id/name para no-admins
--    (los admins y las Edge Functions con service_role sí pueden cambiarlos).
--  · Departamentos vuelven a ser fijos: 'sales' | 'partners' (se re-añade el CHECK
--    y se elimina la tabla dinámica `departments` de la ronda 1).
-- ─────────────────────────────────────────────────────────────

-- Guard: además de role/is_active, un no-admin no puede tocar su departamento ni
-- su vínculo de HubSpot.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    new.role               := old.role;
    new.is_active          := old.is_active;
    new.department         := old.department;
    new.hubspot_owner_id   := old.hubspot_owner_id;
    new.hubspot_owner_name := old.hubspot_owner_name;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_update() from anon, authenticated;

-- Departamento fijo de nuevo (NULL permitido; el CHECK no rechaza NULL).
alter table public.profiles drop constraint if exists profiles_department_check;
alter table public.profiles
  add constraint profiles_department_check check (department in ('sales','partners'));

-- La tabla dinámica de la ronda 1 ya no se usa.
drop table if exists public.departments;

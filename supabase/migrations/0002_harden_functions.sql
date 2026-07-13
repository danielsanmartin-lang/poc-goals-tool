-- Endurecimiento de seguridad tras el advisor:
--  · is_admin() se mueve a un esquema `private` NO expuesto por PostgREST,
--    de modo que no sea invocable como RPC /rest/v1/rpc/is_admin.
--  · Las funciones de trigger dejan de ser ejecutables vía API.
--  · set_updated_at fija search_path.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- is_admin en esquema privado (sigue siendo SECURITY DEFINER para no recursar RLS)
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- guard_profile_update pasa a usar private.is_admin()
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

-- Reapuntar políticas a private.is_admin()
drop policy profiles_select_self_or_admin on public.profiles;
drop policy profiles_admin_write on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or private.is_admin());
create policy profiles_admin_write on public.profiles
  for all using (private.is_admin()) with check (private.is_admin());

drop policy pocs_select on public.pocs;
drop policy pocs_update on public.pocs;
drop policy pocs_delete on public.pocs;
create policy pocs_select on public.pocs
  for select using (ae_id = auth.uid() or private.is_admin());
create policy pocs_update on public.pocs
  for update using (ae_id = auth.uid() or private.is_admin())
             with check (ae_id = auth.uid() or private.is_admin());
create policy pocs_delete on public.pocs
  for delete using (ae_id = auth.uid() or private.is_admin());

-- Eliminar la versión pública de is_admin (ya sin referencias)
drop function public.is_admin();

-- Trigger fns: no deben ser invocables vía API
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.guard_profile_update() from public;

-- search_path explícito
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

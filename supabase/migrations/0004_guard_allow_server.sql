-- El guard de escalada solo debe aplicarse a sesiones de usuario reales
-- (auth.uid() no nulo). Las operaciones server-side/SQL (service_role, o el
-- SQL editor del dashboard) tienen auth.uid() nulo y son de confianza — así el
-- bootstrap del primer admin (UPDATE ... set role='admin') funciona sin
-- desactivar triggers. Un usuario 'authenticated' no-admin sigue bloqueado.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_update() from anon, authenticated;

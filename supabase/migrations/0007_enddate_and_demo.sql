-- Fecha de fin de la PoC + aislamiento de datos "demo".
--  · pocs.end_date: fecha de fin.
--  · is_demo (profiles y pocs): separa la data de demostración de la real, de
--    modo que un admin demo solo ve data demo y un admin real solo ve data real.
alter table public.pocs     add column if not exists end_date date;
alter table public.profiles add column if not exists is_demo  boolean not null default false;
alter table public.pocs     add column if not exists is_demo  boolean not null default false;

-- ¿El usuario en sesión es un usuario demo?
create or replace function private.viewer_is_demo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function private.viewer_is_demo() from public, anon;
grant execute on function private.viewer_is_demo() to authenticated;

-- Al insertar una PoC desde una sesión real, hereda is_demo del creador.
-- (Inserciones server-side/SQL con auth.uid() nulo respetan el valor dado.)
create or replace function public.set_poc_is_demo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.is_demo := coalesce((select is_demo from public.profiles where id = auth.uid()), false);
  end if;
  return new;
end;
$$;
revoke execute on function public.set_poc_is_demo() from public, anon, authenticated;
create trigger pocs_set_is_demo
  before insert on public.pocs
  for each row execute function public.set_poc_is_demo();

-- RLS: los admins solo ven filas de su "mundo" (demo o real).
drop policy pocs_select on public.pocs;
create policy pocs_select on public.pocs
  for select using (
    ae_id = auth.uid()
    or (private.is_admin() and is_demo = private.viewer_is_demo())
  );

-- profiles: el SELECT queda gobernado SOLO por esta política (quitamos la
-- política admin ALL, que incluía SELECT sin filtrar por demo). Las escrituras
-- de admin sobre perfiles van por Edge Function (service_role), no por RLS.
drop policy if exists profiles_admin_write on public.profiles;
drop policy profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (
    id = auth.uid()
    or (private.is_admin() and is_demo = private.viewer_is_demo())
  );

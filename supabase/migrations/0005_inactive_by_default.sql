-- Defensa en profundidad: los perfiles nuevos nacen INACTIVOS.
-- Aunque el registro público estuviera habilitado, un auto-registro no da
-- acceso: la app (auth.loadProfile) rechaza is_active=false, e is_admin()
-- también exige is_active. Solo un admin (vía Edge Function admin-create-user,
-- que activa al crear) o el bootstrap del primer admin activan una cuenta.
alter table public.profiles alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, must_change_password, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'ae',
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, true),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

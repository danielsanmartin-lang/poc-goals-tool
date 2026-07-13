-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  POC Goals Tool — esquema inicial                                  ║
-- ║  Seguridad ante todo: RLS deny-by-default en todas las tablas,     ║
-- ║  is_admin() SECURITY DEFINER (evita recursión de RLS), y triggers  ║
-- ║  que impiden que un usuario se auto-promocione a admin.            ║
-- ╚══════════════════════════════════════════════════════════════════╝

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- PROFILES  (1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  full_name             text default '',
  role                  text not null default 'ae' check (role in ('ae','admin')),
  must_change_password  boolean not null default true,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Helper: ¿el usuario actual es admin? SECURITY DEFINER para poder leer
-- profiles sin disparar las políticas RLS de la propia tabla (evita recursión).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- POCS
-- ─────────────────────────────────────────────────────────────
create table public.pocs (
  id              uuid primary key default gen_random_uuid(),
  ae_id           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title           text,
  company         text,
  status          text not null default 'draft' check (status in ('draft','in_progress','finished','extended')),
  kickoff_date    date,
  ae_name         text,
  objective       text,
  users_in_scope  int,
  scope_in        text,
  scope_out       text,
  comments        text,
  contacts        jsonb not null default '[]'::jsonb,
  use_cases       text[] not null default '{}',
  vectors         jsonb not null default '{}'::jsonb,
  precheck        jsonb not null default '{}'::jsonb,
  timeline        jsonb not null default '[]'::jsonb,
  deal_id         text,            -- reservado para futuro enlace HubSpot
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pocs_ae_id_idx  on public.pocs(ae_id);
create index pocs_status_idx on public.pocs(status);

-- ─────────────────────────────────────────────────────────────
-- Triggers de mantenimiento
-- ─────────────────────────────────────────────────────────────

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger pocs_set_updated_at
  before update on public.pocs
  for each row execute function public.set_updated_at();

-- Al crear un usuario en auth.users se crea su profile.
-- Nota de seguridad: el rol NO se toma del metadata (para que nadie pueda
-- auto-asignarse 'admin' vía signUp). Se crea siempre como 'ae'; el rol lo
-- ajusta después la Edge Function admin-create-user (que valida al llamante).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'ae',
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impide que un no-admin cambie su propio rol o su estado activo.
-- (Un usuario sí puede actualizar full_name y poner must_change_password=false.)
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ─────────────────────────────────────────────────────────────
-- RLS — deny by default
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.pocs     enable row level security;

-- profiles: cada uno ve/edita el suyo; el admin, todos.
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- pocs: el AE dueño ve/edita las suyas; el admin, todas.
create policy pocs_select on public.pocs
  for select using (ae_id = auth.uid() or public.is_admin());

create policy pocs_insert on public.pocs
  for insert with check (ae_id = auth.uid());

create policy pocs_update on public.pocs
  for update using (ae_id = auth.uid() or public.is_admin())
             with check (ae_id = auth.uid() or public.is_admin());

create policy pocs_delete on public.pocs
  for delete using (ae_id = auth.uid() or public.is_admin());

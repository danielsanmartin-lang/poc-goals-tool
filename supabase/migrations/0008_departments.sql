-- ─────────────────────────────────────────────────────────────
-- Departamentos dinámicos
-- Antes: profiles.department era texto con CHECK ('sales','partners').
-- Ahora: tabla catálogo `departments` que alimenta el desplegable. Cualquier
-- usuario puede añadir uno nuevo ("Otro") y queda disponible para el resto.
-- Se elimina el CHECK: la lista válida la gobierna la UI a partir de la tabla.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.departments (
  key        text primary key,               -- valor guardado en profiles.department
  label_en   text not null,
  label_es   text not null,
  created_at timestamptz not null default now()
);

-- Semilla: los dos departamentos que ya existían.
insert into public.departments (key, label_en, label_es) values
  ('sales',    'Sales',    'Sales'),
  ('partners', 'Partners', 'Partners')
on conflict (key) do nothing;

-- El department ya no está atado a un CHECK fijo.
alter table public.profiles drop constraint if exists profiles_department_check;

-- RLS: todo usuario autenticado puede leer el catálogo y añadir uno nuevo.
-- (Sin update/delete para usuarios: quedan denegados por defecto.)
alter table public.departments enable row level security;

create policy departments_select_authenticated on public.departments
  for select to authenticated using (true);

create policy departments_insert_authenticated on public.departments
  for insert to authenticated with check (true);

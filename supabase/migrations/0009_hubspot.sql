-- ─────────────────────────────────────────────────────────────
-- Integración HubSpot (OAuth por usuario)
-- Cada usuario conecta SU cuenta de HubSpot. Los tokens y la identidad HubSpot
-- viven SOLO en estas tablas, con RLS activado y SIN políticas: el navegador
-- nunca puede leerlas; únicamente las Edge Functions (service_role) las tocan.
-- El estado de conexión se expone al frontend vía la función `hubspot-status`.
-- ─────────────────────────────────────────────────────────────

-- Tokens + identidad HubSpot de cada usuario (1:1 con profiles).
create table if not exists public.hubspot_connections (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  access_token        text not null,
  refresh_token       text not null,
  expires_at          timestamptz not null,
  hub_id              text,
  hubspot_owner_id    text,          -- fuente de verdad para filtrar "sus" deals
  hubspot_user_email  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Nonce anti-CSRF del flujo OAuth: relaciona el `state` con el usuario que inició.
create table if not exists public.hubspot_oauth_states (
  state       text primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- pocs.deal_id ya existe (reservado desde 0001). Índice para búsquedas por deal.
create index if not exists pocs_deal_id_idx on public.pocs(deal_id);

-- RLS: activado y deny-all (sin políticas) → solo service_role accede.
alter table public.hubspot_connections  enable row level security;
alter table public.hubspot_oauth_states enable row level security;

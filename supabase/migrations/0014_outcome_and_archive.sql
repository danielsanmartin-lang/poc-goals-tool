-- Resultado de la PoC (cierre) + archivado con purga automática.
--  · pocs.outcome:       veredicto de cierre (success/neutral/lost). Interno.
--  · pocs.outcome_notes: descripción libre de qué ha pasado. Interno.
--  · pocs.archived_at:   marca de archivado (soft-delete). NULL = activa.
-- Las PoCs archivadas se borran automáticamente a los 30 días vía pg_cron.
alter table public.pocs
  add column if not exists outcome       text,
  add column if not exists outcome_notes text,
  add column if not exists archived_at   timestamptz;

-- Veredicto acotado (nullable: una PoC sin cerrar no tiene veredicto).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pocs_outcome_check'
  ) then
    alter table public.pocs
      add constraint pocs_outcome_check
      check (outcome is null or outcome in ('success','neutral','lost'));
  end if;
end $$;

-- Índice para filtrar/purgar archivadas.
create index if not exists pocs_archived_at_idx on public.pocs(archived_at);

-- ─────────────────────────────────────────────────────────────
-- Purga automática de archivadas (> 30 días).
-- El job corre como 'postgres' (salta RLS): purga por igual demo y real.
-- cron.schedule hace upsert por nombre, así que re-aplicar es idempotente.
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
select cron.schedule(
  'purge-archived-pocs',
  '0 3 * * *',
  $$delete from public.pocs where archived_at is not null and archived_at < now() - interval '30 days'$$
);

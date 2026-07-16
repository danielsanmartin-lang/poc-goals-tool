-- Acorta la purga automática de PoCs archivadas: de 30 a 5 días.
-- cron.schedule hace upsert por nombre, así que re-programar el job con el
-- mismo nombre reemplaza el intervalo anterior (idempotente).
select cron.schedule(
  'purge-archived-pocs',
  '0 3 * * *',
  $$delete from public.pocs where archived_at is not null and archived_at < now() - interval '5 days'$$
);

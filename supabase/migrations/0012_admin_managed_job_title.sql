-- ─────────────────────────────────────────────────────────────
-- El puesto de trabajo (job_title) pasa a ser SOLO de admin.
--  · Lo elige el admin al crear el usuario (Edge Function admin-create-user)
--    o al editarlo (admin-user-action → update_profile), ambos con service_role.
--  · Un usuario normal NO puede cambiar su propio job_title: el guard lo congela,
--    igual que ya hacía con role/is_active/department/hubspot_owner_*.
-- ─────────────────────────────────────────────────────────────

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    new.role               := old.role;
    new.is_active          := old.is_active;
    new.job_title          := old.job_title;
    new.department         := old.department;
    new.hubspot_owner_id   := old.hubspot_owner_id;
    new.hubspot_owner_name := old.hubspot_owner_name;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_update() from anon, authenticated;

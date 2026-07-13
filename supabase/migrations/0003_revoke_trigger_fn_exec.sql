-- Supabase concede EXECUTE directamente a anon/authenticated en funciones del
-- esquema public. Las funciones de trigger no deben ser invocables vía API.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.guard_profile_update() from anon, authenticated;

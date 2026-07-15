// Edge Function: admin-user-action
// Acciones de admin sobre un usuario existente:
//   · reset_password  → nueva contraseña provisional + forzar cambio
//   · set_active      → activar/desactivar (y banear en Auth si se desactiva)
//   · delete_user     → borrar un usuario desactivado (cascada)
//   · update_profile  → editar nombre, rol, puesto, departamento y HubSpot
// SOLO un admin autenticado. service_role únicamente en el runtime. Las
// ediciones de perfiles ajenos van por aquí porque RLS solo deja que cada
// usuario actualice su propia fila (profiles_update_self).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'http://127.0.0.1:8765',
  'http://localhost:8765',
  'https://danielsanmartin-lang.github.io',
];
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json(401, { error: 'Missing Authorization' }, origin);

    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json(401, { error: 'Invalid session' }, origin);
    const { data: prof } = await caller
      .from('profiles').select('role, is_active, is_demo').eq('id', user.id).single();
    if (!prof || prof.role !== 'admin' || prof.is_active === false) {
      return json(403, { error: 'Admins only' }, origin);
    }
    if (prof.is_demo === true) return json(403, { error: 'Demo mode is read-only' }, origin);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const userId = String(body.user_id || '');
    if (!userId) return json(400, { error: 'user_id required' }, origin);
    if (userId === user.id && action === 'set_active' && body.is_active === false) {
      return json(400, { error: 'You cannot deactivate yourself' }, origin);
    }

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    if (action === 'reset_password') {
      const password = String(body.password || '');
      if (password.length < 8) return json(400, { error: 'password must be at least 8 characters' }, origin);
      const { error: e1 } = await admin.auth.admin.updateUserById(userId, { password });
      if (e1) return json(400, { error: e1.message }, origin);
      await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
      return json(200, { ok: true }, origin);
    }

    if (action === 'set_active') {
      const isActive = body.is_active !== false;
      const { error: e2 } = await admin.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (e2) return json(400, { error: e2.message }, origin);
      // Banear/desbanear en Auth para cortar/permitir el login efectivamente.
      await admin.auth.admin.updateUserById(userId, { ban_duration: isActive ? 'none' : '876000h' });
      return json(200, { ok: true }, origin);
    }

    if (action === 'delete_user') {
      if (userId === user.id) return json(400, { error: 'You cannot delete yourself' }, origin);
      // Solo se pueden borrar usuarios desactivados.
      const { data: target } = await admin.from('profiles').select('is_active').eq('id', userId).single();
      if (!target) return json(404, { error: 'User not found' }, origin);
      if (target.is_active !== false) return json(400, { error: 'Deactivate the user before deleting' }, origin);
      // Borra el usuario de Auth → la cascada elimina su profile y sus PoCs.
      const { error: e3 } = await admin.auth.admin.deleteUser(userId);
      if (e3) return json(400, { error: e3.message }, origin);
      return json(200, { ok: true }, origin);
    }

    if (action === 'update_profile') {
      // Actualización PARCIAL: solo se tocan los campos presentes en el body.
      // Así el panel de admin (que envía todo) y el auto-perfil del admin (que
      // envía solo email/nombre/puesto/departamento) conviven sin pisar el
      // vínculo de HubSpot ni el rol de quien no lo manda.
      const upd: Record<string, unknown> = {};
      if ('full_name' in body) {
        const fn = String(body.full_name || '').trim();
        if (fn) upd.full_name = fn;
      }
      if ('job_title' in body) {
        upd.job_title = body.job_title ? String(body.job_title).trim().slice(0, 120) : null;
      }
      if ('department' in body) {
        upd.department = (body.department === 'sales' || body.department === 'partners') ? body.department : null;
      }
      if ('hubspot_owner_id' in body) {
        upd.hubspot_owner_id = body.hubspot_owner_id ? String(body.hubspot_owner_id) : null;
        upd.hubspot_owner_name = body.hubspot_owner_name ? String(body.hubspot_owner_name) : null;
      }
      // El rol nunca se cambia sobre uno mismo (evita quedarse sin admins).
      if ('role' in body && userId !== user.id) {
        upd.role = body.role === 'admin' ? 'admin' : 'ae';
      }
      // Cambio de email: actualiza Auth (login) ya confirmado + la columna email.
      if ('email' in body) {
        const email = String(body.email || '').trim().toLowerCase();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return json(400, { error: 'invalid email' }, origin);
        }
        const { error: eMail } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
        if (eMail) return json(400, { error: eMail.message }, origin);
        upd.email = email;
      }
      if (Object.keys(upd).length === 0) return json(200, { ok: true }, origin);
      const { error: e4 } = await admin.from('profiles').update(upd).eq('id', userId);
      if (e4) return json(400, { error: e4.message }, origin);
      return json(200, { ok: true }, origin);
    }

    return json(400, { error: 'unknown action' }, origin);
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) }, origin);
  }
});

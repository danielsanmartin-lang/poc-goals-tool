// Edge Function: admin-create-user
// Crea un usuario (email + contraseña provisional). SOLO un admin autenticado
// puede llamarla. La service_role key vive únicamente aquí (variable de entorno
// del runtime), nunca en el navegador.
//
// Desplegar con verify_jwt=false: la verificación de identidad y rol se hace
// dentro de la función (así el preflight OPTIONS de CORS no se bloquea).
import { createClient } from 'npm:@supabase/supabase-js@2';

// Orígenes permitidos (añadir el de GitHub Pages tras el despliegue).
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

    // Cliente como el llamante → identificar al usuario y comprobar rol.
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json(401, { error: 'Invalid session' }, origin);

    const { data: prof } = await caller
      .from('profiles').select('role, is_active').eq('id', user.id).single();
    if (!prof || prof.role !== 'admin' || prof.is_active === false) {
      return json(403, { error: 'Admins only' }, origin);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim();
    const role = body.role === 'admin' ? 'admin' : 'ae';
    const password = String(body.password || '');
    if (!email || !password) return json(400, { error: 'email and password are required' }, origin);
    if (password.length < 8) return json(400, { error: 'password must be at least 8 characters' }, origin);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, must_change_password: true },
    });
    if (cErr) return json(400, { error: cErr.message }, origin);

    // El trigger creó el profile como 'ae', inactivo y con must_change_password.
    // Lo activamos (is_active=true), fijamos full_name y, si procede, promovemos
    // a admin (service_role, sin RLS).
    const upd: Record<string, unknown> = { full_name, is_active: true };
    if (role === 'admin') upd.role = 'admin';
    const { error: pErr } = await admin.from('profiles').update(upd).eq('id', created.user.id);
    if (pErr) return json(500, { error: 'user created but profile update failed: ' + pErr.message }, origin);

    return json(200, { ok: true, id: created.user.id, email }, origin);
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) }, origin);
  }
});

// Utilidades compartidas por las Edge Functions de HubSpot.
// Modelo: token de Private App COMPARTIDO (con scopes de solo lectura de deals/
// contactos/owners + files + notes). Vive como secreto del runtime; nunca en el
// navegador.
//   Secretos: HUBSPOT_TOKEN, y los ya existentes SUPABASE_URL / SUPABASE_ANON_KEY /
//   SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const HS_API = 'https://api.hubapi.com';

export const ALLOWED_ORIGINS = [
  'http://127.0.0.1:8765',
  'http://localhost:8765',
  'https://danielsanmartin-lang.github.io',
];

export function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Missing env ${name}`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface CallerProfile {
  id: string; role: string; is_active: boolean; is_demo: boolean;
  full_name: string | null; email: string | null;
  department: string | null;
  hubspot_owner_id: string | null; hubspot_owner_name: string | null;
}

// Identifica al llamante por su JWT y devuelve su perfil (rechaza inactivos).
export async function requireUser(req: Request): Promise<CallerProfile> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) throw new HttpError(401, 'Missing Authorization');
  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Invalid session');
  const { data: prof } = await caller
    .from('profiles')
    .select('id, role, is_active, is_demo, full_name, email, department, hubspot_owner_id, hubspot_owner_name')
    .eq('id', user.id).single();
  if (!prof || prof.is_active === false) throw new HttpError(403, 'Inactive or unknown user');
  return prof as CallerProfile;
}

export function handleError(e: unknown, origin: string | null) {
  if (e instanceof HttpError) return json(e.status, { error: e.message }, origin);
  return json(500, { error: String((e as Error)?.message || e) }, origin);
}

// fetch a la API de HubSpot con el token compartido de la Private App.
// Lanza HttpError con el cuerpo si el error es del servidor de HubSpot (5xx).
export async function hs(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${HS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('HUBSPOT_TOKEN')}`, ...(init.headers || {}) },
  });
  if (!r.ok && r.status >= 500) throw new HttpError(502, `HubSpot ${path} failed (${r.status})`);
  return r;
}

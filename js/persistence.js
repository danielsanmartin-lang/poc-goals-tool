// Persistencia contra Supabase (tabla `pocs`). RLS garantiza que cada AE solo
// accede a sus POCs y el admin a todas — aquí no hace falta filtrar por dueño.
import { sb } from './supabaseClient.js';
import { getProfile } from './auth.js';

// POC (modelo de la app) → fila de la tabla
function toRow(poc) {
  const row = {
    title: (poc.title && poc.title.trim()) || poc.company || null,
    company: poc.company || null,
    status: poc.status || 'draft',
    kickoff_date: poc.kickoff_date || null,
    end_date: poc.end_date || null,
    ae_name: poc.ae || (getProfile() && getProfile().full_name) || null,
    objective: poc.objective || null,
    users_in_scope: poc.users !== '' && poc.users != null ? parseInt(poc.users, 10) : null,
    scope_in: poc.scope_in || null,
    scope_out: poc.scope_out || null,
    comments: poc.comments || null,
    contacts: poc.contacts || [],
    use_cases: poc.use_cases || [],
    vectors: poc.vectors || {},
    precheck: poc.precheck || {},
    timeline: poc.timeline || [],
  };
  if (Number.isNaN(row.users_in_scope)) row.users_in_scope = null;
  return row;
}

// Fila → POC (state.normalizePoc completará los huecos)
export function fromRow(row) {
  return {
    id: row.id,
    company: row.company || '',
    ae: row.ae_name || '',
    kickoff_date: row.kickoff_date || '',
    end_date: row.end_date || '',
    status: row.status || 'draft',
    contacts: Array.isArray(row.contacts) && row.contacts.length ? row.contacts : undefined,
    objective: row.objective || '',
    use_cases: Array.isArray(row.use_cases) ? row.use_cases : [],
    scope_in: row.scope_in || '',
    scope_out: row.scope_out || '',
    users: row.users_in_scope != null ? String(row.users_in_scope) : '',
    vectors: row.vectors && Object.keys(row.vectors).length ? row.vectors : undefined,
    precheck: row.precheck || {},
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    comments: row.comments || '',
    title: row.title || '',
  };
}

// Listado (columnas ligeras para la tabla)
export async function listPocs() {
  const { data, error } = await sb
    .from('pocs')
    .select('id, title, company, status, kickoff_date, end_date, ae_name, ae_id, users_in_scope, updated_at, owner:profiles!ae_id(full_name, job_title, department)')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPocById(id) {
  const { data, error } = await sb.from('pocs').select('*').eq('id', id).single();
  if (error) throw error;
  return fromRow(data);
}

// Inserta o actualiza. Devuelve el id (y lo fija en poc.id si era nuevo).
export async function savePoc(poc) {
  const row = toRow(poc);
  if (poc.id) {
    const { error } = await sb.from('pocs').update(row).eq('id', poc.id);
    if (error) throw error;
    return poc.id;
  }
  // Nuevo: ae_id se rellena solo con el default auth.uid() de la tabla.
  const { data, error } = await sb.from('pocs').insert(row).select('id').single();
  if (error) throw error;
  poc.id = data.id;
  return data.id;
}

export async function deletePoc(id) {
  const { error } = await sb.from('pocs').delete().eq('id', id);
  if (error) throw error;
}

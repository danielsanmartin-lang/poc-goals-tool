// Edge Function: hubspot-owners
// Lista los owners (usuarios) activos de HubSpot para el selector de "vincular mi
// usuario de HubSpot" (perfil y alta de usuario). Usa el token compartido.
//   POST {} → { owners: [{ id, name, email }] }
// Desplegar con verify_jwt=false (identidad verificada dentro con el JWT).
import { corsHeaders, handleError, hs, HttpError, json, requireUser } from '../_shared/hubspot.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  try {
    await requireUser(req); // cualquier usuario activo puede ver la lista de owners

    const owners: Array<{ id: string; name: string; email: string }> = [];
    let after: string | null = null;
    // Hasta ~300 owners (3 páginas) — suficiente para el equipo.
    for (let page = 0; page < 3; page++) {
      const q = new URLSearchParams({ limit: '100' });
      if (after) q.set('after', after);
      const r = await hs(`/crm/v3/owners/?${q.toString()}`);
      if (!r.ok) throw new HttpError(502, 'Could not list HubSpot owners');
      const data = await r.json();
      for (const o of data.results ?? []) {
        if (o.archived) continue;
        const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email || String(o.id);
        owners.push({ id: String(o.id), name, email: o.email || '' });
      }
      after = data.paging?.next?.after ?? null;
      if (!after) break;
    }
    owners.sort((a, b) => a.name.localeCompare(b.name));
    return json(200, { owners }, origin);
  } catch (e) {
    return handleError(e, origin);
  }
});

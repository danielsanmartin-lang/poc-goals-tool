// Edge Function: hubspot-export
// Sube el PDF de una PoC a HubSpot y lo adjunta al deal enlazado: lo carga en la
// Files API y crea una Nota asociada al deal con hs_attachment_ids → así aparece
// en la tarjeta "Archivos adjuntos" del deal. Usa el token compartido.
//   POST { poc_id, filename, pdf_base64 } → { ok, dealUrl }
// Desplegar con verify_jwt=false (identidad verificada dentro con el JWT).
import { adminClient, corsHeaders, handleError, hs, HttpError, json, requireUser } from '../_shared/hubspot.ts';

// Tipo de asociación por defecto Nota → Deal en HubSpot.
const NOTE_TO_DEAL = 214;

async function portalId(): Promise<string | null> {
  try {
    const r = await hs('/account-info/v3/details');
    if (r.ok) { const j = await r.json(); return j.portalId != null ? String(j.portalId) : null; }
  } catch (_e) { /* opcional: solo para construir la URL */ }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  try {
    const profile = await requireUser(req);
    if (profile.is_demo) throw new HttpError(403, 'Demo mode is read-only');

    const body = await req.json().catch(() => ({}));
    const pocId = String(body.poc_id || '');
    const filename = String(body.filename || 'poc.pdf').replace(/[^\w.\- ]+/g, '_');
    const pdfB64 = String(body.pdf_base64 || '');
    if (!pocId || !pdfB64) throw new HttpError(400, 'poc_id and pdf_base64 are required');

    const admin = adminClient();

    // La PoC debe existir, pertenecer al llamante y tener deal enlazado.
    const { data: poc } = await admin.from('pocs').select('id, ae_id, deal_id, company').eq('id', pocId).single();
    if (!poc) throw new HttpError(404, 'PoC not found');
    if (poc.ae_id !== profile.id) throw new HttpError(403, 'Not your PoC');
    if (!poc.deal_id) throw new HttpError(400, 'This PoC is not linked to a HubSpot deal');

    // 1) Subir el fichero a la Files API.
    const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
    form.append('folderPath', '/PoC Goals Tool');
    form.append('options', JSON.stringify({ access: 'PRIVATE' }));

    const upRes = await hs('/files/v3/files', { method: 'POST', body: form });
    if (!upRes.ok) throw new HttpError(502, 'File upload failed: ' + (await upRes.text()));
    const file = await upRes.json();
    const fileId = file.id;

    // 2) Crear una Nota con el adjunto, asociada al deal.
    const noteRes = await hs('/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `PoC Goals — ${poc.company || 'PoC'} (exported from PoC Goals Tool)`,
          hs_attachment_ids: String(fileId),
        },
        associations: [{
          to: { id: String(poc.deal_id) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_DEAL }],
        }],
      }),
    });
    if (!noteRes.ok) throw new HttpError(502, 'Note creation failed: ' + (await noteRes.text()));

    const pid = await portalId();
    const dealUrl = pid ? `https://app.hubspot.com/contacts/${pid}/record/0-3/${poc.deal_id}` : null;
    return json(200, { ok: true, fileId, dealUrl }, origin);
  } catch (e) {
    return handleError(e, origin);
  }
});

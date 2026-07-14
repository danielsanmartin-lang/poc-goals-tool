// Edge Function: hubspot-deals
// Lista los deals del usuario (su owner de HubSpot) y las etapas del pipeline,
// o los detalles de un deal para prerrellenar la PoC. Usa el token compartido.
//   POST { stage?: string }   → { stages:[{id,label,pipeline}], deals:[{id,dealname,dealstage,amount,closedate}] }
//   POST { deal_id: string }  → { deal:{ id, dealname, company, contacts:[{name,role,email,phone}] } }
// Desplegar con verify_jwt=false (identidad verificada dentro con el JWT).
import { corsHeaders, handleError, hs, HttpError, json, requireUser } from '../_shared/hubspot.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  try {
    const profile = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    // ── Modo detalle: un deal concreto (para prerrellenar) ──
    if (body.deal_id) {
      const dealId = String(body.deal_id);
      const dRes = await hs(`/crm/v3/objects/deals/${dealId}?associations=companies,contacts&properties=dealname,dealstage,amount,closedate`);
      if (!dRes.ok) throw new HttpError(404, 'Deal not found');
      const deal = await dRes.json();

      // Empresa asociada (nombre) → prefill de "company"; si no hay, usa el dealname.
      let company = deal.properties?.dealname ?? '';
      const companyId = deal.associations?.companies?.results?.[0]?.id;
      if (companyId) {
        const cRes = await hs(`/crm/v3/objects/companies/${companyId}?properties=name`);
        if (cRes.ok) { const c = await cRes.json(); if (c.properties?.name) company = c.properties.name; }
      }

      // Contactos asociados → lista de contactos de la PoC.
      let contacts: Array<Record<string, string>> = [];
      const contactIds = (deal.associations?.contacts?.results ?? []).slice(0, 25).map((r: { id: string }) => ({ id: r.id }));
      if (contactIds.length) {
        const bRes = await hs('/crm/v3/objects/contacts/batch/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'], inputs: contactIds }),
        });
        if (bRes.ok) {
          const b = await bRes.json();
          contacts = (b.results ?? []).map((c: { properties: Record<string, string> }) => ({
            name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ').trim(),
            role: c.properties.jobtitle || '',
            email: c.properties.email || '',
            phone: c.properties.phone || '',
          }));
        }
      }

      return json(200, { deal: { id: dealId, dealname: deal.properties?.dealname ?? '', company, contacts } }, origin);
    }

    // ── Modo lista: etapas + deals del owner, ACOTADO al pipeline de su departamento ──
    if (!profile.hubspot_owner_id) {
      throw new HttpError(400, 'Your profile is not linked to a HubSpot user yet');
    }

    // Pipelines de deals; elegimos el que corresponde al departamento del usuario:
    // partners → "Pipeline de Partners"; sales → el pipeline de ventas (no-partner).
    const pRes = await hs('/crm/v3/pipelines/deals');
    const pipelines: Array<{ id: string; label: string; stages: Array<{ id: string; label: string }> }> =
      pRes.ok ? ((await pRes.json()).results ?? []) : [];
    const isPartner = (label: string) => /partner/i.test(label);
    let target: { id: string; label: string; stages: Array<{ id: string; label: string }> } | undefined;
    if (profile.department === 'partners') {
      target = pipelines.find((p) => isPartner(p.label));
    } else if (profile.department === 'sales') {
      target = pipelines.find((p) => !isPartner(p.label) && /sales/i.test(p.label))
            || pipelines.find((p) => !isPartner(p.label));
    }
    // Sin departamento o sin pipeline correspondiente → nada que mostrar.
    if (!target) return json(200, { stages: [], deals: [] }, origin);

    const stages = (target.stages ?? []).map((s) => ({ id: s.id, label: s.label, pipeline: target!.label }));

    // Deals del owner en ESE pipeline (opcionalmente filtrados por etapa).
    const filters: Array<Record<string, string>> = [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(profile.hubspot_owner_id) },
      { propertyName: 'pipeline', operator: 'EQ', value: String(target.id) },
    ];
    if (body.stage) filters.push({ propertyName: 'dealstage', operator: 'EQ', value: String(body.stage) });

    const sRes = await hs('/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters }],
        properties: ['dealname', 'dealstage', 'amount', 'closedate', 'deal_currency_code'],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
        limit: 100,
      }),
    });
    if (!sRes.ok) throw new HttpError(502, 'HubSpot deal search failed');
    const s = await sRes.json();
    const deals = (s.results ?? []).map((d: { id: string; properties: Record<string, string> }) => ({
      id: d.id,
      dealname: d.properties.dealname || '',
      dealstage: d.properties.dealstage || '',
      amount: d.properties.amount || '',
      closedate: d.properties.closedate || '',
    }));

    return json(200, { stages, deals }, origin);
  } catch (e) {
    return handleError(e, origin);
  }
});

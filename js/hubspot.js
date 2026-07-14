// Cliente de las Edge Functions de HubSpot (el token vive solo en el servidor).
import { sb } from './supabaseClient.js';

async function invoke(fn, body) {
  const { data, error } = await sb.functions.invoke(fn, { body: body || {} });
  if (error) {
    let msg = error.message || 'Error';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const j = await error.context.json();
        if (j && j.error) msg = j.error;
      }
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Lista de owners (usuarios) de HubSpot para el selector de vinculación.
export async function listOwners() {
  const d = await invoke('hubspot-owners', {});
  return (d && d.owners) || [];
}
// Lista etapas + deals del usuario (opcionalmente filtrados por etapa).
export function listDeals(stage) { return invoke('hubspot-deals', stage ? { stage } : {}); }
// Detalle de un deal (para prerrellenar): { deal:{ id, dealname, company, contacts[] } }.
export function dealDetail(dealId) { return invoke('hubspot-deals', { deal_id: dealId }); }
// Sube el PDF de la PoC al deal enlazado.
export function exportToDeal(pocId, filename, pdfBase64) {
  return invoke('hubspot-export', { poc_id: pocId, filename, pdf_base64: pdfBase64 });
}

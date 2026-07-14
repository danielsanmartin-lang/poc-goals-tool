// Selector de deals de HubSpot para el alta de una PoC nueva.
// Solo se muestra si el usuario tiene HubSpot conectado y no es demo.
import * as hs from './hubspot.js';
import { pick } from './i18n.js';
import { getPoc } from './state.js';
import { getProfile, isDemo } from './auth.js';
import { renderForm, saveNow } from './form.js';

let wired = false;

function el(id) { return document.getElementById(id); }
function msg(text) { const m = el('hsPickerMsg'); if (m) m.textContent = text || ''; }

function fillStages(stages) {
  const sel = el('hsStage');
  sel.innerHTML = '';
  const all = document.createElement('option');
  all.value = ''; all.textContent = pick('All stages', 'Todas las etapas'); sel.appendChild(all);
  // Etiqueta con pipeline solo si hay más de uno (evita ambigüedad).
  const multi = new Set(stages.map((s) => s.pipeline)).size > 1;
  stages.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = multi ? `${s.label} · ${s.pipeline}` : s.label;
    sel.appendChild(o);
  });
}

function fillDeals(deals) {
  const sel = el('hsDeal');
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = deals.length ? pick('— Select a deal —', '— Elige un deal —') : pick('— No deals —', '— Sin deals —');
  sel.appendChild(ph);
  deals.forEach((d) => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.dealname || d.id; sel.appendChild(o);
  });
}

async function loadDeals(stageId) {
  const sel = el('hsDeal');
  sel.innerHTML = `<option value="">${pick('— Loading… —', '— Cargando… —')}</option>`;
  try {
    const { deals } = await hs.listDeals(stageId || undefined);
    fillDeals(deals || []);
  } catch (e) { msg(e.message); }
}

async function onPickDeal(dealId) {
  if (!dealId) return;
  msg(pick('Importing…', 'Importando…'));
  try {
    const { deal } = await hs.dealDetail(dealId);
    const poc = getPoc();
    poc.deal_id = deal.id;
    if (deal.company) poc.company = deal.company;
    if (Array.isArray(deal.contacts) && deal.contacts.length) {
      poc.contacts = deal.contacts.map((c) => ({
        name: c.name || '', role: c.role || '', email: c.email || '', phone: c.phone || '',
      }));
    }
    renderForm();
    await saveNow(); // persiste la PoC nueva ya enlazada al deal
    msg(pick('Imported from HubSpot ✓', 'Importado de HubSpot ✓'));
  } catch (e) { msg(e.message); }
}

export function mountDealPicker() {
  if (wired) return;
  wired = true;
  el('hsStage').addEventListener('change', (e) => loadDeals(e.target.value));
  el('hsDeal').addEventListener('change', (e) => onPickDeal(e.target.value));
}

export function hideDealPicker() {
  const p = el('hsPicker');
  if (p) p.hidden = true;
}

// Muestra y puebla el selector para una PoC nueva (si procede).
export async function openDealPicker() {
  const p = el('hsPicker');
  if (!p) return;
  p.hidden = true;
  if (isDemo()) return;
  // Solo si el admin vinculó al usuario con HubSpot y le asignó un departamento.
  const prof = getProfile();
  if (!prof || !prof.hubspot_owner_id || !prof.department) return;

  p.hidden = false;
  msg('');
  el('hsDeal').innerHTML = '';
  try {
    const { stages } = await hs.listDeals();
    const list = stages || [];
    if (!list.length) {
      fillStages([]);
      fillDeals([]);
      msg(pick('No HubSpot deals for your department.', 'No hay deals de HubSpot para tu departamento.'));
      return;
    }
    fillStages(list);
    const pocStage = list.find((s) => /poc/i.test(s.label));
    el('hsStage').value = pocStage ? pocStage.id : '';
    await loadDeals(pocStage ? pocStage.id : '');
  } catch (e) { msg(e.message); }
}

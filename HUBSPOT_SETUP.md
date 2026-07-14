# HubSpot integration — setup & deploy

The tool integrates with HubSpot using a **shared Private App token** (read deals/contacts/
owners + files + notes). The token lives **only** as a Supabase Edge Function secret — never
in the browser. Each user links their profile to their HubSpot user by picking their name
from a dropdown (in **My profile**, or set by an admin when creating the user).

## 1. Get the Private App token

HubSpot → **Settings → Integrations → Private Apps** → your app → **Auth** tab → copy the
**Access token** (starts with `pat-...`). It must have these scopes:

`oauth`, `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.owners.read`,
`crm.objects.notes.write`, `crm.schemas.deals.read`, `files`

## 2. Set the Supabase secret

Set the token as a function secret (do **not** commit it or put it in `js/config.js`):

```bash
supabase secrets set HUBSPOT_TOKEN=pat-xxxxxxxx-your-token-here
```

(or Supabase dashboard → Project → Edge Functions → Secrets). `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are already set for the existing functions.

## 3. Deploy the Edge Functions — ✅ ALREADY DONE

`hubspot-owners`, `hubspot-deals`, `hubspot-export` (new) and `admin-create-user` (redeployed
with the HubSpot-owner field) are **already deployed** (all `verify_jwt=false`; identity is
checked inside each function from the caller's JWT). Smoke-tested: each returns
`401 Missing Authorization` when called without a session, confirming they boot and the
shared module resolves.

To redeploy later via CLI (bundles `_shared/` automatically):

```bash
supabase functions deploy hubspot-owners     --no-verify-jwt
supabase functions deploy hubspot-deals       --no-verify-jwt
supabase functions deploy hubspot-export      --no-verify-jwt
supabase functions deploy admin-create-user   --no-verify-jwt
```

## 4. Already applied to the DB (no action needed)

- `0008_departments.sql` — dynamic `departments` table (dropped the old CHECK).
- `0009_hubspot.sql` / `0010_hubspot_private_app.sql` — added `profiles.hubspot_owner_id` +
  `hubspot_owner_name`, an index on `pocs.deal_id`, and removed the unused OAuth tables.

## 5. Verify end-to-end

1. **My profile** → *HubSpot user* dropdown lists your real HubSpot owners → pick yourself →
   Save. (An admin can also set this in *Create user*.)
2. **New POC** → the *Import from HubSpot* picker appears, defaults to the **PoC** stage,
   filters by stage, and picking a deal prefills company + contacts and links the deal.
3. On that PoC, **Export to HubSpot** → the PDF appears under the deal's *Archivos adjuntos*.

Notes:
- Until the token is set and the functions are deployed, the HubSpot dropdown and deal picker
  stay hidden (they degrade gracefully) — the rest of the app is unaffected.
- The note→deal association uses HubSpot's default type id `214`; if HubSpot rejects it,
  adjust `NOTE_TO_DEAL` in `supabase/functions/hubspot-export/index.ts`.
- Since the token is shared, files/notes are attributed to the Private App (not the individual
  user). Deal visibility is still scoped per user via the owner id on their profile.

# PR00 — Public Form Identity P0 | implementation candidate (DRAFT)

NO MERGE / NO DEPLOY / NO PROD TESTS.
This branch contains a candidate to remove global slug-first resolution, not an approved release.

## Intended behavior
- Canonical platform: /f/id/{formId}/{slug} plus GET/POST by immutable form UUID.
- Verified custom host: slug resolved only inside tenant with status/SSL gates.
- Unknown or missing host: fail closed.
- Legacy platform slug-only: **NO automatic fallback**. A verified owner-reviewed manifest explicitly binds the historical slug to an immutable form ID + tenant ID; absent/malformed/unverified mapping returns 404. Custom-domain slugs remain tenant-scoped.
- Tracking, GTM, CAPI, attribution, consent remain the existing shared POST handler.
- Form listing and dashboard use canonical URLs; verified custom domain links remain unchanged.

## BLOCKERS BEFORE MERGE
1. Audit existing published URL ownership without accessing lead PII, including inactive/deleted forms and external campaigns.
2. **Policy implemented in Draft** via `PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON`, but **NO real aliases have been approved or provisioned**. Inventory and validate historical URL ownership before rollout; a unique active slug cannot prove ownership.
3. Tenant A/B and duplicate-slug database-backed tests passed in a previous CI Smoke Test using disposable `localhost/flipform_ci`. New verified alias scenarios and parser validation have been added; latest CI results **pending**. Full HTTP GET/POST, rate limiting, tracking and consent regression still pending.
4. Review all route/host logic, existing bookmarks, opened browser tabs and former URLs.
5. Verify Meta/GTM/CAPI, Google attribution, WhatsApp consent and rate limiting without calling external services.
6. Review CI, rollback, expected URL migrations, and human approval. No automatic merge.

## KNOWN LIMITATIONS
- Old unique-active-slug fallback was removed in Draft because it could silently route a historical link to a different tenant. Release **without completed alias inventory/configuration would deliberately return 404 for unmapped legacy platform links**, causing commercial disruption; do NOT deploy until accounted for.
- Inactive/renamed/deleted forms and canonical stale-slug UX need decision.
- External campaign link inventories are not visible in source code.
- Separate P0 concurrency findings remain pending.

PR #622 is evidence-only; this draft is a candidate patch, NOT production authorization.

## 19/11/2026 — Database-backed fixture test (CI only)

- New `tests/public-form-identity.integration.test.ts` creates *synthetic* tenants A and B and the same public slug in separate tenant-scoped forms. It asserts the platform legacy slug no longer selects either when ambiguous, while the immutable ID resolves each correctly.
- A separate synthetic custom domain belonging to B must resolve only B's form (both slug and ID), refuse A's ID, and stop resolving when SSL is not active. Inactive form must not resolve.
- CI Smoke Test runs after `prisma db push` to the ephemeral local runner database `flipform_ci`. The test checks `CI=true`, local host, database path, and non-production NODE_ENV **before any fixtures are created**. No Neon, Vercel, Meta/Pixel, Google, WhatsApp, Stripe or customer records.
- **This is not historical alias validation.** No evidence has yet been collected about existing outbound campaign links or previous ownership of a slug, so no automatic merge or deployment is authorized.

## 19/11/2026 — Explicit historical alias allowlist (DRAFT only)

The runtime reads an **optional** server environment variable `PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON` for *platform-host* requests at `/f/<slug>` and the legacy GET/POST API selectors. The same shared resolver is used by all three handlers. There is **no migration**, no new database table, no changes to the tenant data, and no automatic discovery from active forms.

Example **SYNTHETIC** manifest (placeholder UUIDs, do not use this as real mapping):

```json
{
  "version": 1,
  "verified": [
    {
      "slug": "salario-maternidade",
      "formId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "tenantId": "11111111-1111-4111-8111-111111111111",
      "evidenceRef": "PR00-APPROVAL-SYNTHETIC"
    }
  ]
}
```

### Required operational sequence, before a production approval

1. **Inventory** all published legacy links from the platform's own form registry and link-generation pathways, plus external Meta/Google/Site campaigns, links in WhatsApp, QR codes, cards, websites, bookmarks and other public materials. **Do not access user/customer data or advertiser accounts in this Draft stage.** Obtain separate consent/authority and an appropriate least-privilege report for a later production metadata-only inventory, if needed.
2. **Provenance**: for every original platform slug link, record verified tenant owner, immutable form UUID, source URL, evidence ticket/reference and whether the form was renamed/deactivated. Never infer from whichever current form happens to share the slug. Conflicting/missing proof must block release until resolved; no silent reassignment and no guessing.
3. **Manual approval**: the sole operator signs the inventory/risk record and explicitly notes that this is **not independent review**. Prefer an external reviewer for critical changes. No manifest entry should be created from assumptions.
4. **Stage** the approved manifest using server-side environment configuration and test the full rendering and GET/POST route with synthetic fixtures and external tracking off. **No real manifest is included in the source branch.**
5. **Release decision**: only after a documented compatibility plan accounts for live legacy links, valid canonical URL rollout, tracking/consent regression and rollback. Separately authorize secrets/config changes, merge and production deployment; CI green alone is insufficient.
6. **Rollback**: preserve immutable form URLs, a reviewed manifest and the last known-good deployment; revert only after an explicit change request and verify that any pre-existing legacy URLs still have a safe destination. Do not change Ads/Pixel, GTM or leads as part of an unapproved rollback.

### Fail-closed semantics

- Without the manifest or an entry for a legacy platform slug, GET/POST/page returns the existing not-found response (404); this is **intentional** and a release blocker until historical links are reconciled.
- Invalid JSON, duplicate slugs, missing evidence reference, invalid form/tenant UUIDs, or excessive manifest size reject the whole manifest; never choose a candidate based on database row order.
- After an alias is selected, Prisma additionally requires **both** `id` and `tenantId` and `isActive: true`; a wrong mapping cannot resolve another tenant's form.
- Canonical platform paths use immutable IDs; verified custom-domain paths remain scoped to their owning tenant. Existing Meta/GTM/WhatsApp and lead submission logic is unchanged.
- This allowlist is **an implementation mechanism, not a certificate of historical ownership**. An operator must supply/approve genuine evidence references.

### Outstanding blockers

- Real historical URL inventory and owner signoff; safe access is **not authorized yet**.
- HTTP GET/POST integration with fake data; current tests cover resolver plus pure policy.
- External campaign/Meta/GTM/consent behavior must be proven without triggering live events.
- Production change authorization, backup/rollback review and PR #624 review; keep Draft/unmerged.

# PR00 — Public Form Identity P0 | implementation candidate (DRAFT)

NO MERGE / NO DEPLOY / NO PROD TESTS.
This branch contains a candidate to remove global slug-first resolution, not an approved release.

## Intended behavior
- Canonical platform: /f/id/{formId}/{slug} plus GET/POST by immutable form UUID.
- Verified custom host: slug resolved only inside tenant with status/SSL gates.
- Unknown or missing host: fail closed.
- Legacy slug-only: zero or multiple current candidates fail closed; exactly one is a TEMPORARY bridge, NOT historical ownership proof.
- Tracking, GTM, CAPI, attribution, consent remain the existing shared POST handler.
- Form listing and dashboard use canonical URLs; verified custom domain links remain unchanged.

## BLOCKERS BEFORE MERGE
1. Audit existing published URL ownership without accessing lead PII, including inactive/deleted forms and external campaigns.
2. Design verified legacy aliases or equivalent compatibility plan. One current active slug is not enough for historical ownership.
3. Run tenant A/B and duplicate-slug database-backed tests in proven disposable DB. **Test added to CI Smoke Test using localhost/flipform_ci with strict guard; results pending.** Full public HTTP GET/POST handler testing and tracking regression still pending.
4. Review all route/host logic, existing bookmarks, opened browser tabs and former URLs.
5. Verify Meta/GTM/CAPI, Google attribution, WhatsApp consent and rate limiting without calling external services.
6. Review CI, rollback, expected URL migrations, and human approval. No automatic merge.

## KNOWN LIMITATIONS
- Legacy unique-active-slug fallback has not solved historical URL ownership.
- Inactive/renamed/deleted forms and canonical stale-slug UX need decision.
- External campaign link inventories are not visible in source code.
- Separate P0 concurrency findings remain pending.

PR #622 is evidence-only; this draft is a candidate patch, NOT production authorization.

## 19/11/2026 — Database-backed fixture test (CI only)

- New `tests/public-form-identity.integration.test.ts` creates *synthetic* tenants A and B and the same public slug in separate tenant-scoped forms. It asserts the platform legacy slug no longer selects either when ambiguous, while the immutable ID resolves each correctly.
- A separate synthetic custom domain belonging to B must resolve only B's form (both slug and ID), refuse A's ID, and stop resolving when SSL is not active. Inactive form must not resolve.
- CI Smoke Test runs after `prisma db push` to the ephemeral local runner database `flipform_ci`. The test checks `CI=true`, local host, database path, and non-production NODE_ENV **before any fixtures are created**. No Neon, Vercel, Meta/Pixel, Google, WhatsApp, Stripe or customer records.
- **This is not historical alias validation.** No evidence has yet been collected about existing outbound campaign links or previous ownership of a slug, so no automatic merge or deployment is authorized.

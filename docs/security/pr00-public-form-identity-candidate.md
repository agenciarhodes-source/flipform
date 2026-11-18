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
3. Run tenant A/B and duplicate-slug runtime tests in proven disposable DB; static tests alone do not count.
4. Review all route/host logic, existing bookmarks, opened browser tabs and former URLs.
5. Verify Meta/GTM/CAPI, Google attribution, WhatsApp consent and rate limiting without calling external services.
6. Review CI, rollback, expected URL migrations, and human approval. No automatic merge.

## KNOWN LIMITATIONS
- Legacy unique-active-slug fallback has not solved historical URL ownership.
- Inactive/renamed/deleted forms and canonical stale-slug UX need decision.
- External campaign link inventories are not visible in source code.
- Separate P0 concurrency findings remain pending.

PR #622 is evidence-only; this draft is a candidate patch, NOT production authorization.

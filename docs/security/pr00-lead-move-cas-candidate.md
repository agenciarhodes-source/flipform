# PR00 — CAS transaction candidate for manual / AI lead moves (DRAFT)

NO MERGE / NO DEPLOY / NO REAL TENANT DATA.

Two critical lead-stage writers used read-then-id-only update, allowing stale history.
This candidate guards updateMany by tenantId, pipelineId, previous stageId and status,
requires count=1, and records history in the same transaction only on success.
Rejected stale moves return 409 (manual) or a concurrent_update result (helper),
without Meta/Google events or success audit side effects.

NOT A COMPLETE P0 SOLUTION:
- Lead-assistant batch/undo still lacks CAS/count integrity; separate patch required.
- Concurrent pipeline stage archiving must be serialized / revalidated in transaction.
- Tenant/pipeline/stage composite database constraints from lab PR #621 are not on main.
- No live database or synthetic multi-transaction race run has been executed by this PR.
- Integration tests must be run only against proven disposable database with fake tenants.
- Existing tracking/outbox and application flows require regression and rollback review.

This PR remains DRAFT independent of PRs #619-#624; do not merge without explicit owner authorization.

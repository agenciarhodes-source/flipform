# PR00 — CAS transaction candidate for manual / AI lead moves (DRAFT)

NO MERGE / NO DEPLOY / NO REAL TENANT DATA.

Two critical lead-stage writers used read-then-id-only update, allowing stale history.
This candidate guards updateMany by tenantId, pipelineId, previous stageId and status,
requires count=1, and records history in the same transaction only on success.
Rejected stale moves return 409 (manual) or a concurrent_update result (helper),
without Meta/Google events or success audit side effects.

NOT A COMPLETE P0 SOLUTION:
- Lead-assistant **stage batch and stage undo now have per-lead CAS/count checks** in `lib/lead-assistant/service.ts`, within serializable transactions. Stage rechecks active, same-tenant destination; conflicts return 409 and aborted operations roll back history/audit. **This remains a Draft candidate and does not constitute synthetic concurrent runtime attestation.**
- Lead-assistant **assignment and tag bulk/undo still have separate CAS/count gaps**, including raw SQL tag updates; review is pending.
- Concurrent pipeline stage archiving must be serialized / revalidated in transaction.
- Tenant/pipeline/stage composite database constraints from lab PR #621 are not on main.
- No live database or synthetic multi-transaction race run has been executed by this PR.
- Integration tests must be run only against proven disposable database with fake tenants.
- Existing tracking/outbox and application flows require regression and rollback review.

This PR remains DRAFT independent of PRs #619-#624; do not merge without explicit owner authorization.

## Checkpoint 18/11/2026 — A2-C P0 batch stage patch

- Stage apply checks `tenantId`, `pipelineId`, previous `stageId` and previous `status` with one `updateMany` per changed lead, requires `count===1` and only then writes history and audit within the same transaction; any stale lead aborts the batch.
- Stage undo checks current destination/status, verifies the previous stage remains active in the same tenant/pipeline, uses conditional `updateMany` and records history only for confirmed restores. Unchanged/moved leads are skipped.
- Two lead-assistant transactions use `Serializable`; Prisma P2034 maps to HTTP 409 in apply/undo routes.
- Added static guard tests. **Still pending:** synthetic multi-connection transaction race; correctness of assignment/tag batches and undo; database relational integrity constraints; cross-feature regression, archive-vs-move race and external event audit. No SQL/data touched.

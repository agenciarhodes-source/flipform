# PR00 — CAS transaction candidate for manual / AI lead moves (DRAFT)

NO MERGE / NO DEPLOY / NO REAL TENANT DATA.

Two critical lead-stage writers used read-then-id-only update, allowing stale history.
This candidate guards updateMany by tenantId, pipelineId, previous stageId and status,
requires count=1, and records history in the same transaction only on success.
Rejected stale moves return 409 (manual) or a concurrent_update result (helper),
without Meta/Google events or success audit side effects.

NOT A COMPLETE P0 SOLUTION:
- Lead-assistant **stage batch and stage undo now have per-lead CAS/count checks** in `lib/lead-assistant/service.ts`, within serializable transactions. Stage rechecks active, same-tenant destination; conflicts return 409 and aborted operations roll back history/audit. **This remains a Draft candidate and does not constitute synthetic concurrent runtime attestation.**
- Lead-assistant assignment apply/undo now uses per-lead CAS and count checks. Tag apply/undo uses a conditional SQL array comparison of previous tags and `RETURNING id`, recording history/audit only for confirmed updates. **Synthetic DB transaction race tests and tenant/pipeline constraint audit remain pending.**
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
- Added static guard tests. **Still pending:** synthetic multi-connection race with real PostgreSQL, relational constraints and rollback verification, cross-feature regression, archive-vs-move race, and external event audit. No SQL/data touched.

### Subsequent batch/undo consistency amendment

- Assignment changes now compare tenant, original assigned user, pipeline, stage and open status per lead; any missing update throws HTTP 409 and the transaction rolls back, including audit.
- Assignment undo now records only actually restored owner changes and skips an owner that another operation changed in the meantime.
- Tag changes compare the entire current PostgreSQL `tags` array with the exact previously seen array, restricted by tenant (and open status for apply), using `RETURNING id`. Apply aborts if not every expected row updated; undo logs only returned rows.
- All checks remain only in PR #625 Draft. No merge, production migrations, secrets or customer data access. Green static tests alone are insufficient for release approval.

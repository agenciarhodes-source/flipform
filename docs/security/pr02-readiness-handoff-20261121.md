# FlipForm API v1 — PR02 readiness handoff (2026-11-21)

## Scope of the current Draft
- PR01 foundation: #627. PR02 layered development: #628. PR02 currently compares against `main` solely to execute existing CI. **PR01 must be approved, merged and revalidated first.**
- Functional read-only draft operations: `GET /api/v1/capabilities`, `/pipelines`, `/pipelines/{pipelineId}/metrics`, `/forms`, `/forms/{formId}/fields`, `/leads`, and `/leads/{leadId}`.
- Credential-scoped `leads.metadata.read` is separate from `pipelines.read` and `pipelines.metrics.read`. Pagination maximum is 50 leads per request.
- Lead ID, form ID, pipeline ID, stage ID, status, `createdAt`, `updatedAt` only. **Lead IDs and timestamps can identify people when linked to other datasets**; never call this anonymous data. Excludes names, phone, email, documents, answers, history, chats and notes.
- Authorization: M2M key bound to tenant, active tenant/plan/grant, revocation, durable per-operation quota, global OFF. No query-based tenant override. No outbound calls, mutations or automatic stage movements.
- GitHub Actions synthetic integration tests use only localhost disposable PostgreSQL; all changes remain Draft.

## Before any operational release (NOT approved)
1. Release gates in `docs/security/pr01-staging-release-gates-DRAFT.json` are currently **NO_GO**. Confirm runtime DB identity and actual runtime egress isolation, not just build or runner isolation.
2. Approve LGPD purpose, lawful basis, retention, deletion/legal hold and who can request pseudonymous lead metadata. Ten additive PR01 FKs remain subject to retention/rollback approval.
3. Review PR00 security dependencies and recovery with production-grade evidence; do not reactivate the four disabled maintenance workflows or enable `MAINTENANCE_GATE`.
4. Complete representative staging regression, backup/restore proof and controlled tenant rollout. Never enable `FLIPFORM_API_V1_ENABLED` or issue real keys from green CI alone.
5. Rebase/compare PR02 against the independently approved PR01 base. Recheck tests, diffs and approvals. No automatic merge or deploy.
6. Design external writes separately: idempotency, audit and permissions are needed before ingestion; **AI does not move pipeline stages automatically in V1**.

## Approval boundary
This branch is code preparation only. No production DB reads, migrations, network feature purchase, maintenance execution, deployment, feature-flag enablement or merge is authorized by this handoff.

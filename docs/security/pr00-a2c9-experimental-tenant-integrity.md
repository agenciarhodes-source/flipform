# PR 00 — A2-C.9 | Experimental tenant integrity lab

Status: **isolated laboratory PASS for tested rules; production implementation NOT approved**.

## Immutable boundaries
- Neon project `holy-fog-36254823`, source synthetic `br-muddy-wind-bc07yc5d`.
- Created lab: `br-quiet-voice-bcs6win0`, name `pr00-a2c9-structural-lab-20261117`, parent A2-C.4, non-default, 0.25 CU.
- The project's staging root `br-icy-glitter-bcisq63l` has zero application tables; it was not modified.
- Database `flipform_staging`, PostgreSQL 17, 92 tables, 2 completely fictitious tenants, 14 fixture rows.
- No actual customer data, migrations, external integrations, or production operations.

## New, validated lab constraints (6)
- UNIQUE (pipelines.id, pipelines.tenant_id)
- UNIQUE (leads.id, leads.tenant_id)
- UNIQUE (pipeline_stages.id, pipeline_stages.pipeline_id)
- FOREIGN KEY leads(pipeline_id,tenant_id) -> pipelines(id,tenant_id), ON UPDATE/DELETE RESTRICT
- FOREIGN KEY leads(stage_id,pipeline_id) -> pipeline_stages(id,pipeline_id), ON UPDATE/DELETE RESTRICT
- FOREIGN KEY tasks(lead_id,tenant_id) -> leads(id,tenant_id), ON UPDATE RESTRICT, ON DELETE CASCADE

Existing unique/FKs were **retained**. This is deliberately narrow: 3 FKs added for 4 known invalid cases, and does **not** resolve 22 unscoped FK relationships. It does not handle RLS.

## Adversarial test comparison

| Case (all fabricated) | A2-C.7 before | A2-C.9 after |
|---|---|---|
| Lead A -> Pipeline B | Accepted | **Rejected by FK** |
| Lead A -> Stage B | Accepted | **Rejected by FK** |
| Task A -> Lead B | Accepted | **Rejected by FK** |
| Stage A -> Pipeline B | Accepted | **Rejected by FK** |
| Control: Lead A -> nonexistent pipeline | Rejected | Previously verified |

All A2-C.9 test UPDATEs occurred inside an intentionally rolled-back PL/pgSQL subtransaction, using explicit branch guards and error capture. No experimental UPDATE persisted.

## Positive compatibility checks
- Task A can be unlinked from lead (lead_id = NULL), rollback confirmed.
- Task A can refer to Lead A (same tenant), rollback confirmed.
- Lead A can continue in Stage A / Pipeline A, rollback confirmed.

Positive tests above cover basic optionality and existing fixture consistency, **not** ON DELETE SET NULL behavior for the other seven optional relations; no DELETE was executed.

## Checksums (identical before and after)
- Leads `82921cd235a03124a4b81f54df339e73`
- Tasks `2568a229dc63a7e5460bc39575a235d1`
- Pipeline stages `4c0953ddd5af92e210217c87016f921b`

## Application layer already verified
The current main (at base SHA `6def5c5ed92920deadd0f83806f057da4219a022`) already checks:
- `app/api/leads/route.ts`: pipeline and stage both scoped to `session.tenantId`, stage to input pipeline.
- `app/api/leads/[id]/move/route.ts`: lead tenant and destination pipeline constrained.
- `lib/leads/move-stage.ts`: tenant, pipeline and archived-stage filters.
- `app/api/forms/route.ts` and `app/api/forms/[id]/route.ts`: pipeline/stage match tenant.
- PR #615: task ownership rules and tenant-scoped task relationships.

Those checks provide existing **application protection in examined paths**, not universal coverage. All other writers, raw SQL, nested writes, AI, webhooks and finance still require coverage audits.

## Scope of Draft PR
Only: this readme, guarded laboratory SQL as a proposal, static audit test, and a Vercel preview opt-out for this security branch. No changes to Prisma schema, migrations, production code, CI workflow, integrations, or user records. This PR must remain Draft: do not merge. The guard SQL must never be run in any non-laboratory environment.

## Next gates — each needs explicit approval
1. Expand tenant ownership checks to all 22 FK relationships; map indirect/transitive ownership.
2. Prove nullable composite FKs with `ON DELETE SET NULL (optional_fk_column)` and compatibility with Prisma 5.22 client/introspection/migration, avoiding nullifying `tenant_id`.
3. Audit all write paths and handle compound FK constraints in Prisma schema/manual reviewed migration safely.
4. Verify RLS feasibility with non-owner runtime role, or document why DB FKs + API checks are selected.
5. Test negative and positive cases on **separate new disposable branch** and run full CI; re-check staging main unchanged, existing data integrity, and backup/restore.
6. Real customer data preflight **read only and only with separate authorization**. Never auto-move or delete leads. No migrations or merge without separate authorization.

**PR 01 remains blocked.**

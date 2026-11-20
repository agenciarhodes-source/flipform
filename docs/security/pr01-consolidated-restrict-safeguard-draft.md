# PR01 consolidated safeguard — fail-closed deletion constraints (Draft)

**20/11/2026, PR #627. Not a release authorization.**

The ten PR01-only Prisma foreign keys now use `onDelete: Restrict` instead of `Cascade`. No existing baseline model, table, or production database is changed by this commit. This avoids automatic removal of M2M credential audit and delivery attempts when their referenced parents are hard-deleted. It may also cause **existing tenant/integration deletion processes to fail** once PR01 tables exist; compatibility review is mandatory before approving migration.

The disposable GitHub Actions rehearsal checks 92 → 102 tables, ten `RESTRICT` foreign keys, attempts deleting a synthetic tenant and outbox, asserts PostgreSQL rejects both by FK violation, confirms audit and attempt rows remain, then explicitly cleans up fake rows and rehearses rollback of *empty* new tables only (102 → 92). Every SQL write occurs exclusively in `127.0.0.1:5432/pr01_rehearsal` with independent CI/GitHub guards. No Neon access.

The Phase 9 manifest continues with all ten retention decisions **PENDING**, `production_release_authorized: false` and legal hold/LGPD periods undecided. A green CI review is *not* policy approval. A safe production strategy must still define legal retention, delete/disable behavior, backup/rollback, tenant deletion compatibility, environment isolation and separately authorized rollout. No merge, deploy, feature flag, API key or external webhook is enabled here.

# Flip AI — foundation rollout

This PR adds only the authenticated draft configuration surface. It does not publish a chat,
call OpenAI, create leads, send tracking events, or change any existing Meta/Google/WhatsApp integration.

## Entitlement

Access is fail-closed and requires:

- a fresh owner/admin authorization for the selected tenant;
- an active tenant plan whose immutable slug is `premium` or `premium-pro`;
- a compatible active subscription when one exists;
- a valid future grace-period deadline for past-due access.

Creating or pricing those plans is intentionally outside this PR. Existing plans and subscriptions are not modified.

## Database rollout

The migration is additive: it creates `flip_ai_agents` and `flip_ai_endpoints`.
Both reference the existing tenant, pipeline, stage and user records with restrictive foreign keys.
There are no updates or deletes of existing records.

Production rule: **do not run `prisma migrate deploy`**.

Before enabling the feature:

1. confirm the target Neon project, branch and database;
2. take or confirm a recoverable Neon snapshot;
3. review the SQL in `prisma/migrations/20260909120000_flip_ai_agent_drafts/migration.sql`;
4. apply that exact additive SQL manually through the approved production process;
5. verify both tables and indexes with read-only queries;
6. run a Premium-tenant draft create/edit smoke test;
7. verify a non-Premium tenant receives HTTP 403 and no record is written.

Until both tables exist, the UI fails closed with `FLIP_AI_SCHEMA_NOT_READY` and does not attempt a write.

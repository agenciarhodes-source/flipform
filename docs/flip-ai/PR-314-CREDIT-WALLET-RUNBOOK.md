# PR #314 — Flip AI Credit Wallet Runbook

## Scope

This increment adds the prepaid-credit foundation without turning current technical usage events into billing:

- one tenant-scoped credit account;
- an append-only ledger with a tenant-scoped idempotency key;
- atomic credit, debit and refund mutations;
- non-negative balance enforcement in application code and PostgreSQL constraints;
- a read-only balance and history section in `Flip AI > Consumo`;
- graceful UI behavior while the new schema is not present.

It does not activate Premium plans, assign tenants, charge cards, call Asaas, enable auto-recharge,
price OpenAI operations, debit current usage events, publish agents, or change Meta/Google/WhatsApp.

## Migration

Approved migration file:

`prisma/migrations/20260926010000_flip_ai_credit_wallet/migration.sql`

The migration is additive. It creates only:

- `flip_ai_credit_accounts`;
- `flip_ai_credit_ledger`;
- their indexes, checks and tenant-scoped foreign keys.

It contains no data migration and no `DROP`, `TRUNCATE`, `DELETE FROM`, or update of existing
business rows.

## Safe validation

1. create a temporary Neon branch from production;
2. use the direct/non-pooler connection;
3. execute the migration as one transaction;
4. run `npm run flip-ai:diagnose-schema`;
5. confirm:
   - 16 required Flip AI tables;
   - 183 required columns;
   - 57 reviewed indexes;
   - 67 reviewed constraints;
   - 41 foreign keys and 164 compatible RI triggers;
   - no missing, incompatible or unexpected schema objects;
   - Premium and Premium Pro remain inactive;
   - no tenant is assigned to either plan;
   - both new tables are empty.

## Production guardrail

Do not run `prisma migrate deploy` in production.

A production rollout requires separate approval, a fresh recoverable snapshot, the direct connection,
one explicit transaction for this single migration, a stop on the first error, and read-only
post-checks. Never retry an ambiguous result without inspecting the catalog first.

## Ledger contract

- every mutation uses a server-generated or provider-derived idempotency key;
- the unique key is scoped by `tenant_id`;
- conflicting reuse of a key is rejected;
- account rows are locked with `FOR UPDATE`;
- debits cannot make the balance negative;
- the public UI cannot write ledger entries;
- this PR exposes no top-up, debit, payment, gateway, or auto-recharge endpoint;
- current text, retrieval, web-search and Realtime usage events remain informational only.


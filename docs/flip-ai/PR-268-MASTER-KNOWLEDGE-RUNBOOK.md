# PR #268 — Premium catalog and Markdown Mestre

## Scope

This increment registers the approved Premium price points and adds a versioned Markdown Mestre
for each Flip AI agent. It does not call OpenAI, create embeddings, publish chats, create Leads,
or send tracking events.

The Premium catalog rows are intentionally inserted with `is_active = false`:

- Premium: R$ 797/month + future AI consumption;
- Premium Pro: R$ 1,497/month + future AI consumption.

The remaining numeric limits are stored as zero, which the existing FlipForm limit evaluator
interprets as unlimited. All existing software capabilities are enabled. Activation is deferred
until the chat, qualification, usage metering and billing controls are ready.

## Data safety

- Three additive tables hold knowledge bases, document metadata and immutable revisions.
- Updating Markdown creates a revision; it never deletes or overwrites prior content.
- The tenant and agent are resolved and checked server-side on every read/write.
- A SHA-256 digest makes ambiguous retries idempotent.
- Optimistic revision checks reject stale, different updates.
- Content is never written to AuditLog metadata.
- Maximum UTF-8 payload is 1 MB.
- Stored Markdown is edited as plain text and is not rendered as HTML.
- No lead, conversation or integration table is modified.

## Manual production sequence

Production rule: **never run `prisma migrate deploy`**.

The production database currently does not contain the PR #267 tables. Before enabling any
Premium tenant, review and apply manually, in order:

1. `20260909120000_flip_ai_agent_drafts/migration.sql`;
2. `20260909160000_flip_ai_master_knowledge/migration.sql`.

Before applying, reconfirm the Neon project, branch and database and create/confirm a recoverable
snapshot. Afterwards, verify all five tables and both inactive plan rows with read-only SQL.
Do not activate either plan as part of the schema rollout.

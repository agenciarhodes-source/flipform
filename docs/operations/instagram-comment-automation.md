# Instagram comment keyword automation

PR #207 adds the first tenant-safe automation layer on top of Instagram comment ingestion (#205) and the safe private-reply runtime (#206).

## Product behavior

A tenant can configure ordered Instagram comment rules with:

- a name;
- a keyword or phrase;
- match mode `exact` or `contains`;
- the private-reply text;
- an enabled/disabled flag;
- an order index.

The first enabled matching rule wins. Matching is Unicode-normalized, case-insensitive and punctuation-insensitive. `contains` is phrase/token bounded, so a keyword such as `eu` does not match a word such as `meu`.

Only normal `comments` events can trigger this automation. `live_comments` remain ingestion-only because a private reply to Live requires reliable proof that the broadcast is still active.

## Rule persistence

This first cut deliberately introduces no new Prisma model or migration. Rule configuration is stored as append-only snapshots in the existing tenant-scoped `AuditLog`:

- entity type: `instagram_comment_automation`;
- actions: `INSTAGRAM_COMMENT_AUTOMATION_CREATED` and `INSTAGRAM_COMMENT_AUTOMATION_UPDATED`;
- `entityId` is the stable rule ID;
- each create/update creates a new immutable version number.

Writes serialize on the tenant row before checking keyword conflicts. The current configuration is the highest valid version for each rule ID. This keeps configuration history audit-friendly and avoids a schema/backfill solely for this first automation primitive.

There is no destructive DELETE endpoint in this PR. A rule is disabled by writing a new snapshot with `enabled = false`.

## Atomic comment + automation intent

For a new normal comment, FlipForm resolves the matching rule before persistence and then writes the sanitized `instagram_comment` event and, when matched, its `instagram_comment_automation` queue event in the same database transaction.

This matters for retry safety:

- if the transaction fails, neither the comment nor automation intent commits;
- if it commits, both commit together;
- a Meta retry of the same comment hits the existing comment idempotency key and cannot create a later automation under a rule that did not exist when the comment was first processed.

The queued job snapshots the exact rule version. Before dispatch, the worker verifies that this version is still the current enabled version. Editing or disabling the rule after the comment was queued therefore prevents stale copy from being sent.

## Durable queue and worker

Queue items use the existing `WebhookEvent` table with provider `instagram_comment_automation` and `processedAt = null`.

The worker:

1. claims a small batch with `FOR UPDATE SKIP LOCKED`;
2. persists a processing lease before provider work;
3. validates the rule version and source comment again;
4. resolves a currently active tenant user with `INTEGRATIONS_EDIT`, preferring the user who last configured the rule;
5. calls the existing #206 `enqueueAndDispatchInstagramPrivateReply` runtime;
6. uses a deterministic idempotency key per rule + source comment;
7. marks the automation job terminal only after #206 returns a terminal outcome.

If a worker invocation stops unexpectedly, a stale processing lease can be reclaimed. The actual Meta private reply remains protected by the #206 outbox and idempotency rules, so worker recovery does not implement its own blind provider resend.

If a manual private reply already won for the same comment, the later automation is marked `skipped` rather than attempting a second private reply.

## Post-response execution on Vercel

The signed Instagram webhook first validates the provider signature and persists the inbound work. After that it starts a queue drain and registers that Promise with the Next.js request-context `waitUntil` bridge exposed by the current Vercel builder, so the HTTP response can return without waiting for the private-reply network call.

The local adapter reads `globalThis[Symbol.for('@next/request-context')]`, which is the request-context bridge used by current Next.js/Vercel runtimes. It deliberately does not use the retired `@vercel/request-context` symbol. This adds no package or lockfile dependency. Outside a runtime that exposes the bridge, the webhook safely awaits the same Promise as a fallback instead of using untracked fire-and-forget work.

The queue drain is scheduled after every successfully verified Instagram webhook, not only when the current request creates a new job. That gives a later signed webhook an opportunity to reclaim a durable job whose prior background execution stopped unexpectedly.

No Vercel Cron is required by this PR.

## APIs

- `GET /api/integrations/instagram/comment-automations` — list current tenant rules (`INTEGRATIONS_VIEW`).
- `POST /api/integrations/instagram/comment-automations` — create a rule (`INTEGRATIONS_EDIT`).
- `PATCH /api/integrations/instagram/comment-automations/:id` — write a replacement snapshot for one tenant rule (`INTEGRATIONS_EDIT`).

The browser never sends a tenant ID.

## Out of scope

PR #207 does not:

- create or qualify Leads;
- move Kanban stages;
- use AI;
- automate Live comments;
- expose the rule editor UI yet;
- send follow-up messages after the private reply unless the Instagram user later responds under the normal messaging rules.

## Data safety

There is no Prisma migration or schema change in this PR. It does not delete, reset, backfill or mass-update Leads, Conversations, Messages, Forms, pipelines, sales or historical CRM data. New writes are limited to rule audit snapshots and automation/private-reply events created from new Instagram comment activity.

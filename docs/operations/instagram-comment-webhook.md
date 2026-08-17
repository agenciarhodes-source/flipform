# Instagram comment webhook foundation

## Scope

This module extends the existing Instagram Business Login and webhook runtime so Flipform can safely receive Instagram comment events before any private-reply automation is enabled.

It deliberately does **not** send a private reply yet. Sending is a separate PR so webhook ingestion and provider dispatch remain independently reviewable.

## Meta requirements

For Instagram Login, comment/private-reply capability requires the Instagram professional account connection to grant:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`

The professional account is subscribed through `/{IG_ID}/subscribed_apps` to:

- `messages`
- `comments`
- `live_comments`

Existing connections that were established before comment permissions were introduced may continue to receive/send Direct messages. Comment events are accepted only when the audit marker for the current connection confirms that the relevant comment webhook field was subscribed, so those tenants must reconnect before comment automation can be enabled.

## Tenant resolution

The public webhook never accepts or trusts a tenant identifier from Meta.

For every webhook entry, `entry.id` is treated as the Instagram professional account ID. Flipform resolves that ID through the active `TenantInstagramConnection`, then verifies that the current connection has an `INSTAGRAM_WEBHOOK_SUBSCRIBED` audit record created after the connection's current `connectedAt` timestamp.

## Comment payloads

Meta currently documents more than one comment notification shape for Instagram Login. The runtime supports both:

1. `entry.field` + `entry.value`
2. `entry.changes[]` with `field` + `value`

Only `comments` and `live_comments` are accepted.

Normalized data includes, when supplied by Meta:

- comment ID
- Instagram professional account ID
- Instagram-scoped commenter ID
- commenter username
- comment text
- media ID
- media product type
- provider event time

Self-comments are ignored so they cannot later trigger an automation accidentally.

## Durable idempotency

The existing `WebhookEvent` table is reused; no schema or migration is added.

Each comment is persisted with:

- `provider = instagram_comment`
- `eventId = {instagramProfessionalAccountId}:{commentId}`
- `eventType = comments | live_comments`
- `tenantId` resolved server-side
- normalized payload in `rawPayload`
- `processedAt` set when ingestion succeeds

The existing unique constraint on `(provider, eventId)` makes webhook retries idempotent. Prisma `P2002` is treated as a duplicate rather than an error.

## Data safety

This PR does not create Leads, Conversations, Messages, pipeline history, sales records, forms, or assignments from a comment. It does not perform backfills or destructive database operations.

A comment becomes actionable only in a later private-reply/automation step.

## Private reply constraints for the next step

The Meta private-reply API uses the comment ID as `recipient.comment_id`. Current Meta rules include:

- only one private reply per comment;
- send within seven days of a post/reel comment;
- Instagram Live replies only while the broadcast is live;
- follow-up messages require the recipient to respond and then follow the normal response window.

The outbound implementation must enforce those provider constraints independently from webhook ingestion.

# Instagram private reply foundation

This operation documents PR #206, which adds a conservative server-side foundation for replying privately to a persisted Instagram comment.

## Meta contract used

For Instagram API with Instagram Login, private replies use:

- `POST https://graph.instagram.com/{API_VERSION}/{IG_ID}/messages`
- `recipient.comment_id` set to the comment ID
- `message.text` set to the reply text
- permissions include `instagram_business_basic` and `instagram_business_manage_comments`
- webhook subscription includes `comments` (and `live_comments` for Live ingestion)

Meta currently limits private replies to one message per comment. For posts/reels, the private reply must be sent within seven days of the comment. Live replies are only valid while the broadcast is active.

## FlipForm behavior

The public/browser-facing request never supplies the Meta comment ID, Instagram Professional Account ID, access token, App Secret, or tenant ID. The route receives only the persisted FlipForm comment event ID in the URL plus a strict JSON body containing `text` and `idempotencyKey`.

The server then:

1. derives the tenant and user from the authenticated session;
2. loads the `instagram_comment` WebhookEvent inside that tenant;
3. derives the Meta comment ID and Instagram Professional Account ID from the stored sanitized payload;
4. rejects `live_comments` because this PR has no trusted proof that the Live is still active;
5. rejects new sends outside the seven-day window;
6. requires the currently connected Instagram account to match the comment's account;
7. requires the current webhook subscription marker to include `comments`;
8. creates a dedicated `instagram_private_reply` WebhookEvent as the durable outbox;
9. uses a deterministic provider event ID per Instagram account + comment, enforcing at most one private reply attempt per comment;
10. posts to Meta using `recipient.comment_id`;
11. persists only the provider message ID, recipient IGSID, status, timestamps and provider error classification needed for reconciliation.

The reply text is stored only inside the dedicated private-reply outbox event so the exact customer communication can be audited later. Tokens and provider secrets are never persisted there.

## Ambiguous delivery

The outbox writes `sending` before making the network call. If the process dies or the network result is ambiguous, the event becomes `delivery_unknown` and FlipForm does not automatically resend it. This is intentional because Meta allows only one private reply per comment and a blind retry could create an invalid second attempt.

A short-lived `sending` lease prevents concurrent duplicate sends. A stale lease is frozen as `delivery_unknown` rather than retried.

## Idempotency

The first request stores a hash of the idempotency key and a fingerprint of the source comment event + reply text. Repeating the same request returns the stored outcome. Reusing the same key with different text is rejected. A second independent reply attempt for the same comment is also rejected.

## Live comments

`live_comments` continues to be ingested by the #205 webhook foundation, but #206 does not send private replies for Live. A future change must first add a reliable server-side check that the broadcast is still active.

## Data safety

PR #206 adds no Prisma schema changes and no migration. It creates/updates only the dedicated `instagram_private_reply` WebhookEvent used as the outbox for the explicitly requested reply. It does not create, delete or mass-update Leads, Conversations, Messages, pipelines, forms, sales or historical CRM data.

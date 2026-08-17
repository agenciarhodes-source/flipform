import 'server-only';

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { INSTAGRAM_GRAPH_VERSION } from '@/lib/meta/instagram';
import { getInstagramSendConnection } from '@/lib/meta/instagram-send-credentials';

const PRIVATE_REPLY_PROVIDER = 'instagram_private_reply';
const COMMENT_PROVIDER = 'instagram_comment';
const PRIVATE_REPLY_SOURCE = 'flipform_instagram_private_reply_outbox';
const INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION = 'INSTAGRAM_WEBHOOK_SUBSCRIBED';
const SEND_TIMEOUT_MS = 15_000;
const SENDING_LEASE_MS = 2 * 60_000;
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

type DispatchState = 'queued' | 'sending' | 'sent' | 'failed' | 'delivery_unknown';

type PrivateReplyMetadata = {
  source: typeof PRIVATE_REPLY_SOURCE;
  sourceCommentEventId: string;
  connectionId: string;
  instagramUserId: string;
  commentId: string;
  requestedByUserId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  replyText: string;
  dispatchState: DispatchState;
  attemptStartedAt?: string;
  providerMessageId?: string;
  recipientIgScopedId?: string;
  providerAcceptedAt?: string;
  providerFailedAt?: string;
  providerErrorCode?: string;
  providerErrorType?: string;
};

export type InstagramPrivateReplyResult = {
  status: 'sent' | 'failed' | 'delivery_unknown' | 'in_progress';
  eventId: string;
  providerMessageId: string | null;
  recipientIgScopedId: string | null;
  idempotent: boolean;
};

export class InstagramPrivateReplyError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'NOT_CONNECTED'
      | 'COMMENT_NOT_ELIGIBLE'
      | 'LIVE_NOT_SUPPORTED'
      | 'ACCOUNT_MISMATCH'
      | 'ALREADY_REPLIED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'InstagramPrivateReplyError';
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toJson(metadata: PrivateReplyMetadata): Prisma.InputJsonValue {
  return metadata as unknown as Prisma.InputJsonValue;
}

function parsePrivateReplyMetadata(value: Prisma.JsonValue | null | undefined): PrivateReplyMetadata | null {
  const raw = asObject(value);
  if (raw.source !== PRIVATE_REPLY_SOURCE) return null;
  if (
    typeof raw.sourceCommentEventId !== 'string'
    || typeof raw.connectionId !== 'string'
    || typeof raw.instagramUserId !== 'string'
    || typeof raw.commentId !== 'string'
    || typeof raw.requestedByUserId !== 'string'
    || typeof raw.idempotencyKeyHash !== 'string'
    || typeof raw.requestFingerprint !== 'string'
    || typeof raw.replyText !== 'string'
    || typeof raw.dispatchState !== 'string'
  ) return null;
  return raw as unknown as PrivateReplyMetadata;
}

function sendingAttemptIsStale(metadata: PrivateReplyMetadata, now = Date.now()) {
  if (!metadata.attemptStartedAt) return true;
  const startedAt = new Date(metadata.attemptStartedAt).getTime();
  return !Number.isFinite(startedAt) || now - startedAt >= SENDING_LEASE_MS;
}

async function assertRequesterCanPrivateReply(input: { tenantId: string; userId: string }) {
  const membership = await prisma.tenantUser.findFirst({
    where: { tenantId: input.tenantId, userId: input.userId, status: 'active' },
    select: { role: true },
  });
  if (!membership || !can(membership.role, 'INTEGRATIONS_EDIT')) {
    throw new InstagramPrivateReplyError('FORBIDDEN', 'User cannot send Instagram private replies');
  }
}

async function findSourceCommentEvent(input: { tenantId: string; sourceCommentEventId: string }) {
  return prisma.webhookEvent.findFirst({
    where: {
      id: input.sourceCommentEventId,
      tenantId: input.tenantId,
      provider: COMMENT_PROVIDER,
    },
    select: { id: true, eventType: true, rawPayload: true },
  });
}

function parseSourceComment(source: NonNullable<Awaited<ReturnType<typeof findSourceCommentEvent>>>) {
  const raw = asObject(source.rawPayload);
  const instagramUserId = stringField(raw.instagramProfessionalAccountId);
  const commentId = stringField(raw.commentId);
  const occurredAtRaw = stringField(raw.occurredAt);
  if (!instagramUserId || !commentId || !occurredAtRaw) {
    throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Stored Instagram comment is incomplete');
  }
  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Stored Instagram comment timestamp is invalid');
  }
  return { instagramUserId, commentId, occurredAt };
}

function assertCommentIsEligibleForNewReply(
  source: NonNullable<Awaited<ReturnType<typeof findSourceCommentEvent>>>,
  occurredAt: Date,
) {
  if (source.eventType === 'live_comments') {
    throw new InstagramPrivateReplyError(
      'LIVE_NOT_SUPPORTED',
      'Live private replies require proof that the broadcast is still active',
    );
  }
  if (source.eventType !== 'comments') {
    throw new InstagramPrivateReplyError('COMMENT_NOT_ELIGIBLE', 'Webhook event is not a supported Instagram comment');
  }

  const ageMs = Date.now() - occurredAt.getTime();
  if (ageMs < -MAX_FUTURE_CLOCK_SKEW_MS || ageMs > PRIVATE_REPLY_WINDOW_MS) {
    throw new InstagramPrivateReplyError('COMMENT_NOT_ELIGIBLE', 'Instagram comment is outside the private reply window');
  }
}

function subscriptionFields(metadata: Prisma.JsonValue | null | undefined) {
  const raw = asObject(metadata);
  return Array.isArray(raw.fields)
    ? raw.fields.filter((field): field is string => typeof field === 'string')
    : [];
}

async function assertConnectionHasCommentPermission(input: {
  tenantId: string;
  connectionId: string;
  connectedAt: Date;
}) {
  const marker = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: 'tenant_instagram_connection',
      entityId: input.connectionId,
      action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION,
      createdAt: { gte: input.connectedAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  if (!marker || !subscriptionFields(marker.metadata).includes('comments')) {
    throw new InstagramPrivateReplyError(
      'NOT_CONNECTED',
      'Instagram connection must be reauthorized with comment access',
    );
  }
}

function deterministicProviderEventId(instagramUserId: string, commentId: string) {
  return `${instagramUserId}:${commentId}`;
}

function requestFingerprint(sourceCommentEventId: string, text: string) {
  return sha256(`${sourceCommentEventId}\u0000${text}`);
}

async function findExistingOutbox(input: { tenantId: string; providerEventId: string }) {
  return prisma.webhookEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      provider: PRIVATE_REPLY_PROVIDER,
      eventId: input.providerEventId,
    },
  });
}

async function enqueuePrivateReply(input: {
  tenantId: string;
  sourceCommentEventId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
}) {
  const source = await findSourceCommentEvent(input);
  if (!source) throw new InstagramPrivateReplyError('NOT_FOUND', 'Instagram comment event not found');
  const comment = parseSourceComment(source);
  const providerEventId = deterministicProviderEventId(comment.instagramUserId, comment.commentId);
  const fingerprint = requestFingerprint(source.id, input.text);
  const idempotencyKeyHash = sha256(input.idempotencyKey);

  const existing = await findExistingOutbox({ tenantId: input.tenantId, providerEventId });
  if (existing) {
    const metadata = parsePrivateReplyMetadata(existing.rawPayload);
    if (!metadata) throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Stored private reply outbox is invalid');
    if (metadata.idempotencyKeyHash === idempotencyKeyHash && metadata.requestFingerprint !== fingerprint) {
      throw new InstagramPrivateReplyError('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another reply');
    }
    if (metadata.idempotencyKeyHash !== idempotencyKeyHash || metadata.requestFingerprint !== fingerprint) {
      throw new InstagramPrivateReplyError('ALREADY_REPLIED', 'This Instagram comment already has a private reply attempt');
    }
    return { outbox: existing, metadata, created: false as const };
  }

  assertCommentIsEligibleForNewReply(source, comment.occurredAt);

  const connection = await getInstagramSendConnection(input.tenantId);
  if (!connection) throw new InstagramPrivateReplyError('NOT_CONNECTED', 'Instagram is not ready for private replies');
  if (connection.instagramUserId !== comment.instagramUserId) {
    throw new InstagramPrivateReplyError('ACCOUNT_MISMATCH', 'Comment belongs to another Instagram professional account');
  }
  await assertConnectionHasCommentPermission({
    tenantId: input.tenantId,
    connectionId: connection.id,
    connectedAt: connection.connectedAt,
  });

  const metadata: PrivateReplyMetadata = {
    source: PRIVATE_REPLY_SOURCE,
    sourceCommentEventId: source.id,
    connectionId: connection.id,
    instagramUserId: comment.instagramUserId,
    commentId: comment.commentId,
    requestedByUserId: input.requestedByUserId,
    idempotencyKeyHash,
    requestFingerprint: fingerprint,
    replyText: input.text,
    dispatchState: 'queued',
  };

  try {
    const outbox = await prisma.webhookEvent.create({
      data: {
        provider: PRIVATE_REPLY_PROVIDER,
        eventId: providerEventId,
        eventType: 'private_reply',
        tenantId: input.tenantId,
        rawPayload: toJson(metadata),
      },
    });
    return { outbox, metadata, created: true as const };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await findExistingOutbox({ tenantId: input.tenantId, providerEventId });
    const concurrentMetadata = concurrent ? parsePrivateReplyMetadata(concurrent.rawPayload) : null;
    if (!concurrent || !concurrentMetadata) {
      throw new InstagramPrivateReplyError('ALREADY_REPLIED', 'Private reply already exists for this comment');
    }
    if (
      concurrentMetadata.idempotencyKeyHash !== idempotencyKeyHash
      || concurrentMetadata.requestFingerprint !== fingerprint
    ) {
      throw new InstagramPrivateReplyError('ALREADY_REPLIED', 'Private reply already exists for this comment');
    }
    return { outbox: concurrent, metadata: concurrentMetadata, created: false as const };
  }
}

type LockedOutbox = {
  id: string;
  raw_payload: Prisma.JsonValue | null;
};

async function beginDispatch(input: { tenantId: string; outboxId: string }) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedOutbox[]>`
      SELECT id, raw_payload
      FROM public.webhook_events
      WHERE id = ${input.outboxId}
        AND tenant_id = ${input.tenantId}
        AND provider = ${PRIVATE_REPLY_PROVIDER}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new InstagramPrivateReplyError('NOT_FOUND', 'Private reply outbox not found');
    const metadata = parsePrivateReplyMetadata(row.raw_payload);
    if (!metadata) throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Invalid private reply outbox');

    if (metadata.dispatchState === 'sent') return { action: 'sent' as const, metadata };
    if (metadata.dispatchState === 'failed') return { action: 'failed' as const, metadata };
    if (metadata.dispatchState === 'delivery_unknown') return { action: 'delivery_unknown' as const, metadata };
    if (metadata.dispatchState === 'sending') {
      if (!sendingAttemptIsStale(metadata)) return { action: 'in_progress' as const, metadata };
      const nextMetadata: PrivateReplyMetadata = { ...metadata, dispatchState: 'delivery_unknown' };
      await tx.webhookEvent.update({
        where: { id: row.id },
        data: { rawPayload: toJson(nextMetadata), processedAt: new Date() },
      });
      return { action: 'delivery_unknown' as const, metadata: nextMetadata };
    }

    const nextMetadata: PrivateReplyMetadata = {
      ...metadata,
      dispatchState: 'sending',
      attemptStartedAt: new Date().toISOString(),
    };
    await tx.webhookEvent.update({ where: { id: row.id }, data: { rawPayload: toJson(nextMetadata) } });
    return { action: 'send' as const, metadata: nextMetadata };
  });
}

async function releaseDispatchToQueued(input: { tenantId: string; outboxId: string }) {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedOutbox[]>`
      SELECT id, raw_payload
      FROM public.webhook_events
      WHERE id = ${input.outboxId} AND tenant_id = ${input.tenantId} AND provider = ${PRIVATE_REPLY_PROVIDER}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return;
    const metadata = parsePrivateReplyMetadata(row.raw_payload);
    if (!metadata || metadata.dispatchState !== 'sending') return;
    const { attemptStartedAt: _attemptStartedAt, ...rest } = metadata;
    await tx.webhookEvent.update({
      where: { id: row.id },
      data: { rawPayload: toJson({ ...rest, dispatchState: 'queued' }) },
    });
  });
}

async function finalizeDispatch(input: {
  tenantId: string;
  outboxId: string;
  state: 'sent' | 'failed' | 'delivery_unknown';
  providerMessageId?: string;
  recipientIgScopedId?: string;
  errorCode?: string;
  errorType?: string;
}) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedOutbox[]>`
      SELECT id, raw_payload
      FROM public.webhook_events
      WHERE id = ${input.outboxId} AND tenant_id = ${input.tenantId} AND provider = ${PRIVATE_REPLY_PROVIDER}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new InstagramPrivateReplyError('NOT_FOUND', 'Private reply outbox disappeared');
    const metadata = parsePrivateReplyMetadata(row.raw_payload);
    if (!metadata) throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Invalid private reply outbox');
    if (metadata.dispatchState === 'sent') return metadata;

    const now = new Date().toISOString();
    const nextMetadata: PrivateReplyMetadata = {
      ...metadata,
      dispatchState: input.state,
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      ...(input.recipientIgScopedId ? { recipientIgScopedId: input.recipientIgScopedId } : {}),
      ...(input.state === 'sent' ? { providerAcceptedAt: now } : {}),
      ...(input.state === 'failed' ? { providerFailedAt: now } : {}),
      ...(input.errorCode ? { providerErrorCode: input.errorCode } : {}),
      ...(input.errorType ? { providerErrorType: input.errorType } : {}),
    };
    await tx.webhookEvent.update({
      where: { id: row.id },
      data: { rawPayload: toJson(nextMetadata), processedAt: new Date() },
    });
    return nextMetadata;
  });
}

type ProviderSendResult =
  | { kind: 'accepted'; providerMessageId: string; recipientIgScopedId: string }
  | { kind: 'rejected'; errorCode?: string; errorType?: string }
  | { kind: 'unknown' };

async function sendPrivateReplyToMeta(input: {
  instagramUserId: string;
  commentId: string;
  text: string;
  accessToken: string;
}): Promise<ProviderSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(input.instagramUserId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { comment_id: input.commentId },
            message: { text: input.text },
          }),
          signal: controller.signal,
          cache: 'no-store',
        },
      );
    } catch {
      return { kind: 'unknown' };
    }

    let raw: string;
    try {
      raw = await response.text();
    } catch {
      return { kind: 'unknown' };
    }

    let payload: Record<string, any> = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    if (!response.ok) {
      return {
        kind: 'rejected',
        ...(payload?.error?.code != null ? { errorCode: String(payload.error.code) } : {}),
        ...(typeof payload?.error?.type === 'string' ? { errorType: payload.error.type.slice(0, 80) } : {}),
      };
    }

    if (
      typeof payload.message_id !== 'string'
      || !payload.message_id.trim()
      || typeof payload.recipient_id !== 'string'
      || !payload.recipient_id.trim()
    ) {
      return { kind: 'unknown' };
    }

    return {
      kind: 'accepted',
      providerMessageId: payload.message_id.trim(),
      recipientIgScopedId: payload.recipient_id.trim(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resultFromMetadata(
  outboxId: string,
  metadata: PrivateReplyMetadata,
  idempotent: boolean,
  statusOverride?: InstagramPrivateReplyResult['status'],
): InstagramPrivateReplyResult {
  return {
    status: statusOverride || (metadata.dispatchState === 'sent' ? 'sent' : metadata.dispatchState === 'failed' ? 'failed' : 'delivery_unknown'),
    eventId: outboxId,
    providerMessageId: metadata.providerMessageId || null,
    recipientIgScopedId: metadata.recipientIgScopedId || null,
    idempotent,
  };
}

export async function enqueueAndDispatchInstagramPrivateReply(input: {
  tenantId: string;
  sourceCommentEventId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
}): Promise<InstagramPrivateReplyResult> {
  const tenantId = input.tenantId.trim();
  const sourceCommentEventId = input.sourceCommentEventId.trim();
  const requestedByUserId = input.requestedByUserId.trim();
  const text = input.text.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!tenantId || !sourceCommentEventId || !requestedByUserId || !text || !idempotencyKey) {
    throw new InstagramPrivateReplyError('INVALID_REQUEST', 'Missing Instagram private reply fields');
  }

  await assertRequesterCanPrivateReply({ tenantId, userId: requestedByUserId });
  const enqueued = await enqueuePrivateReply({
    tenantId,
    sourceCommentEventId,
    requestedByUserId,
    text,
    idempotencyKey,
  });
  const idempotent = !enqueued.created;
  const dispatch = await beginDispatch({ tenantId, outboxId: enqueued.outbox.id });

  if (dispatch.action === 'sent') return resultFromMetadata(enqueued.outbox.id, dispatch.metadata, true, 'sent');
  if (dispatch.action === 'failed') return resultFromMetadata(enqueued.outbox.id, dispatch.metadata, true, 'failed');
  if (dispatch.action === 'delivery_unknown') return resultFromMetadata(enqueued.outbox.id, dispatch.metadata, true, 'delivery_unknown');
  if (dispatch.action === 'in_progress') return resultFromMetadata(enqueued.outbox.id, dispatch.metadata, true, 'in_progress');

  const connection = await getInstagramSendConnection(tenantId);
  if (!connection) {
    await releaseDispatchToQueued({ tenantId, outboxId: enqueued.outbox.id });
    throw new InstagramPrivateReplyError('NOT_CONNECTED', 'Instagram is not ready for private replies');
  }
  if (
    connection.id !== dispatch.metadata.connectionId
    || connection.instagramUserId !== dispatch.metadata.instagramUserId
  ) {
    await releaseDispatchToQueued({ tenantId, outboxId: enqueued.outbox.id });
    throw new InstagramPrivateReplyError('ACCOUNT_MISMATCH', 'Private reply belongs to another Instagram connection');
  }
  try {
    await assertConnectionHasCommentPermission({
      tenantId,
      connectionId: connection.id,
      connectedAt: connection.connectedAt,
    });
  } catch (error) {
    await releaseDispatchToQueued({ tenantId, outboxId: enqueued.outbox.id });
    throw error;
  }

  const provider = await sendPrivateReplyToMeta({
    instagramUserId: dispatch.metadata.instagramUserId,
    commentId: dispatch.metadata.commentId,
    text: dispatch.metadata.replyText,
    accessToken: connection.accessToken,
  });

  if (provider.kind === 'unknown') {
    const metadata = await finalizeDispatch({
      tenantId,
      outboxId: enqueued.outbox.id,
      state: 'delivery_unknown',
    });
    return resultFromMetadata(enqueued.outbox.id, metadata, idempotent, 'delivery_unknown');
  }

  if (provider.kind === 'rejected') {
    const metadata = await finalizeDispatch({
      tenantId,
      outboxId: enqueued.outbox.id,
      state: 'failed',
      errorCode: provider.errorCode,
      errorType: provider.errorType,
    });
    return resultFromMetadata(enqueued.outbox.id, metadata, idempotent, 'failed');
  }

  const metadata = await finalizeDispatch({
    tenantId,
    outboxId: enqueued.outbox.id,
    state: 'sent',
    providerMessageId: provider.providerMessageId,
    recipientIgScopedId: provider.recipientIgScopedId,
  });
  return resultFromMetadata(enqueued.outbox.id, metadata, idempotent, 'sent');
}

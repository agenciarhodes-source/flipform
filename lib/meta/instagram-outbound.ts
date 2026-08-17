import 'server-only';

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { INSTAGRAM_GRAPH_VERSION } from '@/lib/meta/instagram';
import { getInstagramSendConnection } from '@/lib/meta/instagram-send-credentials';

const SEND_TIMEOUT_MS = 15_000;
const SENDING_LEASE_MS = 2 * 60_000;
const OUTBOX_SOURCE = 'flipform_instagram_outbox';
const OUTBOX_PREFIX = 'local.instagram.';

export type InstagramOutboundResult = {
  status: 'sent' | 'failed' | 'delivery_unknown' | 'in_progress';
  messageId: string;
  providerMessageId: string | null;
  idempotent: boolean;
};

export class InstagramOutboundError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'NOT_CONNECTED'
      | 'RECIPIENT_NOT_ELIGIBLE'
      | 'ACCOUNT_MISMATCH'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'InstagramOutboundError';
  }
}

type DispatchState = 'queued' | 'sending' | 'accepted' | 'sent' | 'failed' | 'delivery_unknown';

type OutboxMetadata = {
  source: typeof OUTBOX_SOURCE;
  connectionId: string;
  instagramUserId: string;
  recipientIgScopedId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  dispatchState: DispatchState;
  attemptStartedAt?: string;
  providerMessageId?: string;
  providerAcceptedAt?: string;
  providerFailedAt?: string;
  providerErrorCode?: string;
  providerErrorType?: string;
};

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function localExternalMessageId(tenantId: string, idempotencyKey: string) {
  return `${OUTBOX_PREFIX}${sha256(`${tenantId}\u0000${idempotencyKey}`)}`;
}

function requestFingerprint(conversationId: string, text: string) {
  return sha256(`${conversationId}\u0000${text}`);
}

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseOutboxMetadata(value: Prisma.JsonValue | null | undefined): OutboxMetadata | null {
  const raw = asObject(value);
  if (raw.source !== OUTBOX_SOURCE) return null;
  if (
    typeof raw.connectionId !== 'string'
    || typeof raw.instagramUserId !== 'string'
    || typeof raw.recipientIgScopedId !== 'string'
    || typeof raw.idempotencyKeyHash !== 'string'
    || typeof raw.requestFingerprint !== 'string'
    || typeof raw.dispatchState !== 'string'
  ) return null;
  return raw as unknown as OutboxMetadata;
}

function toJson(metadata: OutboxMetadata): Prisma.InputJsonValue {
  return metadata as unknown as Prisma.InputJsonValue;
}

function normalizeRecipient(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new InstagramOutboundError('RECIPIENT_NOT_ELIGIBLE', 'Instagram recipient is invalid');
  }
  return normalized;
}

function parseAcceptedAt(metadata: OutboxMetadata) {
  if (!metadata.providerAcceptedAt) return new Date();
  const parsed = new Date(metadata.providerAcceptedAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sendingAttemptIsStale(metadata: OutboxMetadata, now = Date.now()) {
  if (!metadata.attemptStartedAt) return true;
  const startedAt = new Date(metadata.attemptStartedAt).getTime();
  return !Number.isFinite(startedAt) || now - startedAt >= SENDING_LEASE_MS;
}

async function assertRequesterCanSend(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
}) {
  const membership = await prisma.tenantUser.findFirst({
    where: { tenantId: input.tenantId, userId: input.userId, status: 'active' },
    select: { role: true },
  });
  if (!membership || !can(membership.role, 'INBOX_MANAGE')) {
    throw new InstagramOutboundError('FORBIDDEN', 'User cannot send Instagram messages');
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      tenantId: input.tenantId,
      provider: 'meta',
      channel: 'instagram',
    },
    include: {
      externalContactIdentity: { select: { externalUserId: true } },
      lead: { select: { assignedTo: true } },
    },
  });
  if (!conversation) throw new InstagramOutboundError('NOT_FOUND', 'Conversation not found');

  // Meta only permits an app user to message an Instagram user after that user
  // has initiated the conversation. An inbound timestamp is our durable proof.
  if (!conversation.lastInboundAt) {
    throw new InstagramOutboundError('RECIPIENT_NOT_ELIGIBLE', 'Instagram recipient has not initiated the conversation');
  }

  if (membership.role === 'agent') {
    const ownsConversation = conversation.assignedTo === input.userId;
    const ownsLead = conversation.lead?.assignedTo === input.userId;
    if (!ownsConversation && !ownsLead) {
      throw new InstagramOutboundError('FORBIDDEN', 'Agent cannot send in this conversation');
    }
  }

  return conversation;
}

async function getConversationInstagramProfessionalAccountId(input: {
  tenantId: string;
  conversationId: string;
}) {
  const inbound = await prisma.message.findFirst({
    where: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      provider: 'meta',
      channel: 'instagram',
      direction: 'inbound',
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const metadata = asObject(inbound?.metadata);
  const value = metadata.instagramProfessionalAccountId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findExistingOutboxMessage(tenantId: string, externalMessageId: string) {
  return prisma.message.findFirst({
    where: {
      tenantId,
      provider: 'meta',
      channel: 'instagram',
      externalMessageId,
      direction: 'outbound',
    },
  });
}

async function enqueueInstagramTextMessage(input: {
  tenantId: string;
  conversationId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
}) {
  const tenantId = input.tenantId.trim();
  const conversationId = input.conversationId.trim();
  const requestedByUserId = input.requestedByUserId.trim();
  const text = input.text.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!tenantId || !conversationId || !requestedByUserId || !text || !idempotencyKey) {
    throw new InstagramOutboundError('INVALID_REQUEST', 'Missing Instagram outbound fields');
  }

  const conversation = await assertRequesterCanSend({ tenantId, userId: requestedByUserId, conversationId });
  const recipientIgScopedId = normalizeRecipient(conversation.externalContactIdentity.externalUserId);
  const externalMessageId = localExternalMessageId(tenantId, idempotencyKey);
  const fingerprint = requestFingerprint(conversationId, text);
  const idempotencyKeyHash = sha256(idempotencyKey);

  // Existing outbox results are authoritative and do not require a currently
  // valid provider credential. This lets delayed idempotent retries recover the
  // recorded outcome even after a token expires or a connection is revoked.
  const existing = await findExistingOutboxMessage(tenantId, externalMessageId);
  if (existing) {
    const metadata = parseOutboxMetadata(existing.metadata);
    if (!metadata || metadata.requestFingerprint !== fingerprint || existing.conversationId !== conversationId) {
      throw new InstagramOutboundError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with another payload');
    }
    return { message: existing, metadata, created: false as const };
  }

  const connection = await getInstagramSendConnection(tenantId);
  if (!connection) throw new InstagramOutboundError('NOT_CONNECTED', 'Instagram is not ready for outbound messaging');

  const originInstagramUserId = await getConversationInstagramProfessionalAccountId({ tenantId, conversationId });
  if (!originInstagramUserId || originInstagramUserId !== connection.instagramUserId) {
    throw new InstagramOutboundError('ACCOUNT_MISMATCH', 'Conversation belongs to another Instagram professional account');
  }

  const metadata: OutboxMetadata = {
    source: OUTBOX_SOURCE,
    connectionId: connection.id,
    instagramUserId: connection.instagramUserId,
    recipientIgScopedId,
    idempotencyKeyHash,
    requestFingerprint: fingerprint,
    dispatchState: 'queued',
  };

  try {
    const message = await prisma.message.create({
      data: {
        tenantId,
        conversationId,
        provider: 'meta',
        channel: 'instagram',
        externalMessageId,
        direction: 'outbound',
        type: 'text',
        text,
        status: 'queued',
        sentByUserId: requestedByUserId,
        metadata: toJson(metadata),
      },
    });
    return { message, metadata, created: true as const };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await findExistingOutboxMessage(tenantId, externalMessageId);
    const concurrentMetadata = concurrent ? parseOutboxMetadata(concurrent.metadata) : null;
    if (!concurrent || !concurrentMetadata || concurrentMetadata.requestFingerprint !== fingerprint || concurrent.conversationId !== conversationId) {
      throw new InstagramOutboundError('IDEMPOTENCY_CONFLICT', 'Idempotency key collision');
    }
    return { message: concurrent, metadata: concurrentMetadata, created: false as const };
  }
}

type LockedOutbox = {
  id: string;
  conversation_id: string;
  status: string;
  text: string | null;
  metadata: Prisma.JsonValue | null;
};

async function beginDispatch(tenantId: string, messageId: string) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedOutbox[]>`
      SELECT id, conversation_id, status, text, metadata
      FROM public.messages
      WHERE id = ${messageId}
        AND tenant_id = ${tenantId}
        AND provider = 'meta'
        AND channel = 'instagram'
        AND direction = 'outbound'
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new InstagramOutboundError('NOT_FOUND', 'Queued Instagram message not found');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata) throw new InstagramOutboundError('INVALID_REQUEST', 'Message is not an Instagram outbox item');

    if (metadata.providerMessageId) return { action: 'reconcile' as const, row, metadata };
    if (row.status === 'failed' || metadata.dispatchState === 'failed') return { action: 'failed' as const, row, metadata };
    if (metadata.dispatchState === 'delivery_unknown') return { action: 'delivery_unknown' as const, row, metadata };
    if (metadata.dispatchState === 'sending') {
      if (!sendingAttemptIsStale(metadata)) return { action: 'in_progress' as const, row, metadata };

      // An expired sending lease means the process may have died after the Meta
      // request was issued. Never resend: freeze the item as delivery_unknown.
      const nextMetadata: OutboxMetadata = { ...metadata, dispatchState: 'delivery_unknown' };
      await tx.message.update({ where: { id: row.id }, data: { metadata: toJson(nextMetadata) } });
      return { action: 'delivery_unknown' as const, row, metadata: nextMetadata };
    }
    if (row.status === 'sent' || metadata.dispatchState === 'sent') return { action: 'sent' as const, row, metadata };

    const nextMetadata: OutboxMetadata = {
      ...metadata,
      dispatchState: 'sending',
      attemptStartedAt: new Date().toISOString(),
    };
    await tx.message.update({ where: { id: row.id }, data: { metadata: toJson(nextMetadata) } });
    return { action: 'send' as const, row, metadata: nextMetadata };
  });
}

async function markDeliveryUnknown(input: { tenantId: string; messageId: string }) {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string; metadata: Prisma.JsonValue | null }>>`
      SELECT id, metadata
      FROM public.messages
      WHERE id = ${input.messageId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return;
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata || metadata.providerMessageId) return;
    await tx.message.update({
      where: { id: row.id },
      data: { metadata: toJson({ ...metadata, dispatchState: 'delivery_unknown' }) },
    });
  });
}

async function markFailed(input: {
  tenantId: string;
  messageId: string;
  errorCode?: string;
  errorType?: string;
}) {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string; metadata: Prisma.JsonValue | null }>>`
      SELECT id, metadata
      FROM public.messages
      WHERE id = ${input.messageId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return;
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata || metadata.providerMessageId) return;
    const nextMetadata: OutboxMetadata = {
      ...metadata,
      dispatchState: 'failed',
      providerFailedAt: new Date().toISOString(),
      ...(input.errorCode ? { providerErrorCode: input.errorCode } : {}),
      ...(input.errorType ? { providerErrorType: input.errorType } : {}),
    };
    await tx.message.update({
      where: { id: row.id },
      data: { status: 'failed', metadata: toJson(nextMetadata) },
    });
  });
}

async function persistProviderAcceptance(input: {
  tenantId: string;
  messageId: string;
  providerMessageId: string;
}) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string; metadata: Prisma.JsonValue | null }>>`
      SELECT id, metadata
      FROM public.messages
      WHERE id = ${input.messageId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new InstagramOutboundError('NOT_FOUND', 'Outbox message disappeared after Meta acceptance');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata) throw new InstagramOutboundError('INVALID_REQUEST', 'Invalid outbox metadata after Meta acceptance');
    if (metadata.providerMessageId && metadata.providerMessageId !== input.providerMessageId) {
      throw new InstagramOutboundError('IDEMPOTENCY_CONFLICT', 'Outbox item already has another provider message id');
    }
    const nextMetadata: OutboxMetadata = {
      ...metadata,
      providerMessageId: input.providerMessageId,
      providerAcceptedAt: metadata.providerAcceptedAt || new Date().toISOString(),
      dispatchState: 'accepted',
    };
    await tx.message.update({ where: { id: row.id }, data: { metadata: toJson(nextMetadata) } });
    return nextMetadata;
  });
}

async function finalizeAcceptedMessage(input: { tenantId: string; messageId: string }) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      conversation_id: string;
      status: string;
      metadata: Prisma.JsonValue | null;
    }>>`
      SELECT id, conversation_id, status, metadata
      FROM public.messages
      WHERE id = ${input.messageId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new InstagramOutboundError('NOT_FOUND', 'Accepted Instagram outbox item not found');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata?.providerMessageId) throw new InstagramOutboundError('INVALID_REQUEST', 'Provider acceptance is missing');

    const activityAt = parseAcceptedAt(metadata);
    const nextMetadata: OutboxMetadata = { ...metadata, dispatchState: 'sent' };
    await tx.message.update({
      where: { id: row.id },
      data: {
        status: 'sent',
        providerTimestamp: activityAt,
        metadata: toJson(nextMetadata),
      },
    });

    await tx.conversation.updateMany({
      where: {
        id: row.conversation_id,
        tenantId: input.tenantId,
        OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: activityAt } }],
      },
      data: { lastOutboundAt: activityAt },
    });
    await tx.conversation.updateMany({
      where: {
        id: row.conversation_id,
        tenantId: input.tenantId,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: activityAt } }],
      },
      data: { lastMessageAt: activityAt },
    });

    return nextMetadata;
  });
}

type ProviderSendResult =
  | { kind: 'accepted'; providerMessageId: string }
  | { kind: 'rejected'; errorCode?: string; errorType?: string }
  | { kind: 'unknown' };

async function sendInstagramText(input: {
  instagramUserId: string;
  recipientIgScopedId: string;
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
            recipient: { id: input.recipientIgScopedId },
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

    if (typeof payload.message_id !== 'string' || !payload.message_id.trim()) {
      return { kind: 'unknown' };
    }
    return { kind: 'accepted', providerMessageId: payload.message_id.trim() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function enqueueAndDispatchInstagramTextMessage(input: {
  tenantId: string;
  conversationId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
}): Promise<InstagramOutboundResult> {
  const enqueued = await enqueueInstagramTextMessage(input);
  const dispatch = await beginDispatch(input.tenantId, enqueued.message.id);
  const idempotent = !enqueued.created;

  if (dispatch.action === 'failed') {
    return { status: 'failed', messageId: enqueued.message.id, providerMessageId: null, idempotent };
  }
  if (dispatch.action === 'delivery_unknown') {
    return {
      status: 'delivery_unknown',
      messageId: enqueued.message.id,
      providerMessageId: dispatch.metadata.providerMessageId || null,
      idempotent,
    };
  }
  if (dispatch.action === 'in_progress') {
    return { status: 'in_progress', messageId: enqueued.message.id, providerMessageId: null, idempotent };
  }
  if (dispatch.action === 'sent') {
    return {
      status: 'sent',
      messageId: enqueued.message.id,
      providerMessageId: dispatch.metadata.providerMessageId || null,
      idempotent,
    };
  }
  if (dispatch.action === 'reconcile') {
    const metadata = await finalizeAcceptedMessage({ tenantId: input.tenantId, messageId: enqueued.message.id });
    return {
      status: 'sent',
      messageId: enqueued.message.id,
      providerMessageId: metadata.providerMessageId || null,
      idempotent,
    };
  }

  const connection = await getInstagramSendConnection(input.tenantId);
  if (
    !connection
    || connection.id !== dispatch.metadata.connectionId
    || connection.instagramUserId !== dispatch.metadata.instagramUserId
  ) {
    await markFailed({
      tenantId: input.tenantId,
      messageId: enqueued.message.id,
      errorType: 'connection_changed',
    });
    return { status: 'failed', messageId: enqueued.message.id, providerMessageId: null, idempotent };
  }

  const provider = await sendInstagramText({
    instagramUserId: connection.instagramUserId,
    recipientIgScopedId: dispatch.metadata.recipientIgScopedId,
    text: dispatch.row.text || input.text.trim(),
    accessToken: connection.accessToken,
  });

  if (provider.kind === 'rejected') {
    await markFailed({
      tenantId: input.tenantId,
      messageId: enqueued.message.id,
      errorCode: provider.errorCode,
      errorType: provider.errorType,
    });
    return { status: 'failed', messageId: enqueued.message.id, providerMessageId: null, idempotent };
  }

  if (provider.kind === 'unknown') {
    await markDeliveryUnknown({ tenantId: input.tenantId, messageId: enqueued.message.id });
    return { status: 'delivery_unknown', messageId: enqueued.message.id, providerMessageId: null, idempotent };
  }

  await persistProviderAcceptance({
    tenantId: input.tenantId,
    messageId: enqueued.message.id,
    providerMessageId: provider.providerMessageId,
  });
  const metadata = await finalizeAcceptedMessage({ tenantId: input.tenantId, messageId: enqueued.message.id });
  return {
    status: 'sent',
    messageId: enqueued.message.id,
    providerMessageId: metadata.providerMessageId || provider.providerMessageId,
    idempotent,
  };
}

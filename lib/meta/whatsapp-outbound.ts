import 'server-only';

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';
import { getPlatformWhatsAppSendCredentials } from '@/lib/meta/whatsapp-runtime-credentials';
import { processWhatsAppFunnelMessage } from '@/lib/tracking/whatsapp-funnel';

const GRAPH_HOST = 'graph.facebook.com';
const SEND_TIMEOUT_MS = 15_000;
const OUTBOX_SOURCE = 'flipform_whatsapp_outbox';
const OUTBOX_PREFIX = 'local.whatsapp.';

export type WhatsAppOutboundResult = {
  status: 'sent' | 'failed' | 'delivery_unknown' | 'in_progress';
  messageId: string;
  providerMessageId: string | null;
  idempotent: boolean;
};

export class WhatsAppOutboundError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_CONNECTED' | 'INVALID_RECIPIENT' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppOutboundError';
  }
}

type OutboxMetadata = {
  source: typeof OUTBOX_SOURCE;
  connectionId: string;
  phoneNumberId: string;
  recipientWaId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  dispatchState: 'queued' | 'sending' | 'accepted' | 'sent' | 'failed' | 'delivery_unknown';
  attemptStartedAt?: string;
  providerMessageId?: string;
  providerAcceptedAt?: string;
  providerFailedAt?: string;
  providerErrorCode?: string;
  providerErrorType?: string;
  providerStatusAt?: string;
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
    || typeof raw.phoneNumberId !== 'string'
    || typeof raw.recipientWaId !== 'string'
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
  if (!/^\d{5,20}$/.test(normalized)) throw new WhatsAppOutboundError('INVALID_RECIPIENT', 'WhatsApp recipient is invalid');
  return normalized;
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
  if (!membership || !can(membership.role, 'LEADS_CONTACT_WHATSAPP')) {
    throw new WhatsAppOutboundError('FORBIDDEN', 'User cannot send WhatsApp messages');
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      tenantId: input.tenantId,
      provider: 'meta',
      channel: 'whatsapp',
    },
    include: {
      externalContactIdentity: { select: { externalUserId: true } },
      lead: { select: { assignedTo: true } },
    },
  });
  if (!conversation) throw new WhatsAppOutboundError('NOT_FOUND', 'Conversation not found');

  if (membership.role === 'agent') {
    const ownsConversation = conversation.assignedTo === input.userId;
    const ownsLead = conversation.lead?.assignedTo === input.userId;
    if (!ownsConversation && !ownsLead) {
      throw new WhatsAppOutboundError('FORBIDDEN', 'Agent cannot send in this conversation');
    }
  }

  return conversation;
}

async function resolveConnectedWhatsAppConnection(tenantId: string) {
  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true, tenantId: true, phoneNumberId: true, status: true },
  });
  if (!connection) throw new WhatsAppOutboundError('NOT_CONNECTED', 'WhatsApp is not connected for tenant');
  return connection;
}

async function findExistingOutboxMessage(tenantId: string, externalMessageId: string) {
  return prisma.message.findFirst({
    where: {
      tenantId,
      provider: 'meta',
      channel: 'whatsapp',
      externalMessageId,
      direction: 'outbound',
    },
  });
}

async function enqueueWhatsAppTextMessage(input: {
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
    throw new WhatsAppOutboundError('INVALID_REQUEST', 'Missing WhatsApp outbound fields');
  }

  const conversation = await assertRequesterCanSend({ tenantId, userId: requestedByUserId, conversationId });
  const recipientWaId = normalizeRecipient(conversation.externalContactIdentity.externalUserId);
  const connection = await resolveConnectedWhatsAppConnection(tenantId);
  const externalMessageId = localExternalMessageId(tenantId, idempotencyKey);
  const fingerprint = requestFingerprint(conversationId, text);
  const idempotencyKeyHash = sha256(idempotencyKey);

  const existing = await findExistingOutboxMessage(tenantId, externalMessageId);
  if (existing) {
    const metadata = parseOutboxMetadata(existing.metadata);
    if (!metadata || metadata.requestFingerprint !== fingerprint || existing.conversationId !== conversationId) {
      throw new WhatsAppOutboundError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with another payload');
    }
    return { message: existing, metadata, created: false as const };
  }

  const metadata: OutboxMetadata = {
    source: OUTBOX_SOURCE,
    connectionId: connection.id,
    phoneNumberId: connection.phoneNumberId,
    recipientWaId,
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
        channel: 'whatsapp',
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
      throw new WhatsAppOutboundError('IDEMPOTENCY_CONFLICT', 'Idempotency key collision');
    }
    return { message: concurrent, metadata: concurrentMetadata, created: false as const };
  }
}

type LockedOutbox = {
  id: string;
  conversation_id: string;
  status: string;
  text: string | null;
  sent_by_user_id: string | null;
  metadata: Prisma.JsonValue | null;
};

async function beginDispatch(tenantId: string, messageId: string) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedOutbox[]>`
      SELECT id, conversation_id, status, text, sent_by_user_id, metadata
      FROM public.messages
      WHERE id = ${messageId}
        AND tenant_id = ${tenantId}
        AND provider = 'meta'
        AND channel = 'whatsapp'
        AND direction = 'outbound'
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new WhatsAppOutboundError('NOT_FOUND', 'Queued WhatsApp message not found');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata) throw new WhatsAppOutboundError('INVALID_REQUEST', 'Message is not a WhatsApp outbox item');

    if (metadata.providerMessageId) {
      return { action: 'reconcile' as const, row, metadata };
    }
    if (row.status === 'failed' || metadata.dispatchState === 'failed') {
      return { action: 'failed' as const, row, metadata };
    }
    if (metadata.dispatchState === 'delivery_unknown') {
      return { action: 'delivery_unknown' as const, row, metadata };
    }
    if (metadata.dispatchState === 'sending') {
      return { action: 'in_progress' as const, row, metadata };
    }
    if (row.status === 'sent' || row.status === 'delivered' || row.status === 'read') {
      return { action: 'sent' as const, row, metadata };
    }

    const nextMetadata: OutboxMetadata = {
      ...metadata,
      dispatchState: 'sending',
      attemptStartedAt: new Date().toISOString(),
    };
    await tx.message.update({
      where: { id: row.id },
      data: { metadata: toJson(nextMetadata) },
    });
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

async function markProviderRejected(input: {
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
    if (!row) throw new WhatsAppOutboundError('NOT_FOUND', 'Outbox message disappeared after Meta acceptance');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata) throw new WhatsAppOutboundError('INVALID_REQUEST', 'Invalid outbox metadata after Meta acceptance');
    if (metadata.providerMessageId && metadata.providerMessageId !== input.providerMessageId) {
      throw new WhatsAppOutboundError('IDEMPOTENCY_CONFLICT', 'Outbox item already has another provider message id');
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

async function finalizeAcceptedMessage(input: {
  tenantId: string;
  messageId: string;
}) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      conversation_id: string;
      status: string;
      text: string | null;
      sent_by_user_id: string | null;
      metadata: Prisma.JsonValue | null;
    }>>`
      SELECT id, conversation_id, status, text, sent_by_user_id, metadata
      FROM public.messages
      WHERE id = ${input.messageId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new WhatsAppOutboundError('NOT_FOUND', 'Accepted WhatsApp outbox item not found');
    const metadata = parseOutboxMetadata(row.metadata);
    if (!metadata?.providerMessageId) {
      throw new WhatsAppOutboundError('INVALID_REQUEST', 'Provider acceptance is missing');
    }

    if (row.status === 'failed') {
      return { message: row, metadata, finalized: false as const };
    }
    if (row.status === 'sent' || row.status === 'delivered' || row.status === 'read') {
      return { message: row, metadata, finalized: false as const };
    }

    const now = new Date();
    const nextMetadata: OutboxMetadata = { ...metadata, dispatchState: 'sent' };
    const message = await tx.message.update({
      where: { id: row.id },
      data: { status: 'sent', providerTimestamp: now, metadata: toJson(nextMetadata) },
    });
    await tx.conversation.updateMany({
      where: {
        id: row.conversation_id,
        tenantId: input.tenantId,
        OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: now } }],
      },
      data: { lastOutboundAt: now },
    });
    await tx.conversation.updateMany({
      where: {
        id: row.conversation_id,
        tenantId: input.tenantId,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: now } }],
      },
      data: { lastMessageAt: now },
    });
    return { message, metadata: nextMetadata, finalized: true as const };
  });
}

async function sendMetaWhatsAppText(input: {
  phoneNumberId: string;
  recipientWaId: string;
  text: string;
  accessToken: string;
}) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.phoneNumberId}/messages`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.recipientWaId,
        type: 'text',
        text: { preview_url: false, body: input.text },
      }),
    });
  } catch {
    return { kind: 'unknown' as const };
  }

  let payload: any;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) {
    console.error('Meta WhatsApp outbound rejected', {
      httpStatus: response.status,
      metaCode: payload?.error?.code,
      metaType: payload?.error?.type,
    });
    return {
      kind: 'rejected' as const,
      errorCode: payload?.error?.code === undefined ? undefined : String(payload.error.code),
      errorType: typeof payload?.error?.type === 'string' ? payload.error.type : undefined,
    };
  }

  const providerMessageId = typeof payload?.messages?.[0]?.id === 'string' ? payload.messages[0].id : '';
  if (!providerMessageId) return { kind: 'unknown' as const };
  return { kind: 'accepted' as const, providerMessageId };
}

async function runTrackingAfterSend(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  providerMessageId: string;
  text: string;
  sentByUserId: string | null;
  recipientWaId: string;
}) {
  if (!input.sentByUserId) return;
  await processWhatsAppFunnelMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    messageId: input.providerMessageId,
    phone: input.recipientWaId,
    text: input.text,
    direction: 'outbound',
    senderType: 'agent',
    metadata: { source: OUTBOX_SOURCE, localMessageId: input.messageId },
  });
}

export async function enqueueAndDispatchWhatsAppTextMessage(input: {
  tenantId: string;
  conversationId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
}): Promise<WhatsAppOutboundResult> {
  const queued = await enqueueWhatsAppTextMessage(input);
  const begun = await beginDispatch(input.tenantId, queued.message.id);

  if (begun.action === 'failed') {
    return { status: 'failed', messageId: begun.row.id, providerMessageId: begun.metadata.providerMessageId || null, idempotent: !queued.created };
  }
  if (begun.action === 'delivery_unknown') {
    return { status: 'delivery_unknown', messageId: begun.row.id, providerMessageId: null, idempotent: true };
  }
  if (begun.action === 'in_progress') {
    return { status: 'in_progress', messageId: begun.row.id, providerMessageId: null, idempotent: true };
  }
  if (begun.action === 'sent') {
    return { status: 'sent', messageId: begun.row.id, providerMessageId: begun.metadata.providerMessageId || null, idempotent: true };
  }
  if (begun.action === 'reconcile') {
    const finalized = await finalizeAcceptedMessage({ tenantId: input.tenantId, messageId: begun.row.id });
    return {
      status: finalized.message.status === 'failed' ? 'failed' : 'sent',
      messageId: begun.row.id,
      providerMessageId: begun.metadata.providerMessageId || null,
      idempotent: true,
    };
  }

  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: {
      id: begun.metadata.connectionId,
      tenantId: input.tenantId,
      phoneNumberId: begun.metadata.phoneNumberId,
      status: 'connected',
    },
    select: { id: true },
  });
  if (!connection) {
    await markProviderRejected({ tenantId: input.tenantId, messageId: begun.row.id, errorCode: 'connection_revoked' });
    return { status: 'failed', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }

  const credentials = await getPlatformWhatsAppSendCredentials();
  if (!credentials) {
    await markProviderRejected({ tenantId: input.tenantId, messageId: begun.row.id, errorCode: 'runtime_credentials_missing' });
    return { status: 'failed', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }

  const provider = await sendMetaWhatsAppText({
    phoneNumberId: begun.metadata.phoneNumberId,
    recipientWaId: begun.metadata.recipientWaId,
    text: begun.row.text || '',
    accessToken: credentials.systemUserAccessToken,
  });
  if (provider.kind === 'unknown') {
    await markDeliveryUnknown({ tenantId: input.tenantId, messageId: begun.row.id });
    return { status: 'delivery_unknown', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }
  if (provider.kind === 'rejected') {
    await markProviderRejected({
      tenantId: input.tenantId,
      messageId: begun.row.id,
      errorCode: provider.errorCode,
      errorType: provider.errorType,
    });
    return { status: 'failed', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }

  await persistProviderAcceptance({
    tenantId: input.tenantId,
    messageId: begun.row.id,
    providerMessageId: provider.providerMessageId,
  });
  const finalized = await finalizeAcceptedMessage({ tenantId: input.tenantId, messageId: begun.row.id });
  if (finalized.finalized) {
    await runTrackingAfterSend({
      tenantId: input.tenantId,
      conversationId: begun.row.conversation_id,
      messageId: begun.row.id,
      providerMessageId: provider.providerMessageId,
      text: begun.row.text || '',
      sentByUserId: begun.row.sent_by_user_id,
      recipientWaId: begun.metadata.recipientWaId,
    });
  }

  return {
    status: finalized.message.status === 'failed' ? 'failed' : 'sent',
    messageId: begun.row.id,
    providerMessageId: provider.providerMessageId,
    idempotent: !queued.created,
  };
}

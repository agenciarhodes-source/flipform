import 'server-only';

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { claimInboxConversation } from '@/lib/inbox/ownership';
import { seesUnassignedConversations } from '@/lib/inbox/unassigned-viewers';
import { getBusinessGroupAccessesForUser, mapBusinessGroupRoleToTenantRole } from '@/lib/business-groups';
import { META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';
import { getPlatformWhatsAppSendCredentials } from '@/lib/meta/whatsapp-send-credentials';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import { reconcileBufferedWhatsAppStatusesForMessage } from '@/lib/meta/whatsapp-runtime';
import { processWhatsAppFunnelMessage } from '@/lib/tracking/whatsapp-funnel';
import {
  buildPublicAgentSignature,
  getWhatsAppAgentSignatureSettings,
  type WhatsAppAgentSignatureMode,
} from '@/lib/meta/whatsapp-agent-signature';

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
  dispatchState: 'queued' | 'sending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'delivery_unknown';
  attemptStartedAt?: string;
  providerMessageId?: string;
  providerAcceptedAt?: string;
  providerFailedAt?: string;
  providerErrorCode?: string;
  providerErrorType?: string;
  providerStatusAt?: string;
  agentSignatureMode?: WhatsAppAgentSignatureMode;
  agentSignature?: string;
  agentSignatureSkippedReason?: 'message_limit';
  /** An approved template sent in place of free text, to reach someone outside the 24-hour window. */
  template?: WhatsAppOutboundTemplate;
};

export type WhatsAppOutboundTemplate = { name: string; language: string; parameters?: string[] };

function normalizeOutboundTemplate(template: WhatsAppOutboundTemplate | undefined) {
  if (!template) return undefined;
  const name = template.name.trim();
  const language = template.language.trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) {
    throw new WhatsAppOutboundError('INVALID_REQUEST', 'WhatsApp template is invalid');
  }
  const parameters = template.parameters || [];
  if (parameters.length > 3 || parameters.some(value => typeof value !== 'string' || !value.trim() || value.length > 200 || /[\r\n\t]/.test(value))) {
    throw new WhatsAppOutboundError('INVALID_REQUEST', 'WhatsApp template parameters are invalid');
  }
  return parameters.length ? { name, language, parameters } : { name, language };
}

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

function parseAcceptedAt(metadata: OutboxMetadata) {
  if (!metadata.providerAcceptedAt) return new Date();
  const parsed = new Date(metadata.providerAcceptedAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function assertRequesterCanSend(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
}) {
  const membership = await prisma.tenantUser.findFirst({
    where: { tenantId: input.tenantId, userId: input.userId, status: 'active' },
    select: {
      role: true,
      user: { select: { name: true } },
    },
  });
  // Someone who opens this company through its business group has no membership of their own
  // in it; their role there comes from the group, exactly as when they switched into it.
  let role = membership?.role || null;
  let senderName = membership?.user.name || null;
  if (!membership) {
    const state = await getBusinessGroupAccessesForUser(prisma, input.userId);
    const access = state.accesses.find((group) => group.tenants.some((tenant) => tenant.id === input.tenantId));
    if (access) {
      role = mapBusinessGroupRoleToTenantRole(access.role);
      senderName = (await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } }))?.name || null;
    }
  }
  if (!role || !can(role, 'LEADS_CONTACT_WHATSAPP')) {
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

  if (role === 'agent') {
    const ownsConversation = conversation.assignedTo === input.userId;
    const ownsLead = conversation.lead?.assignedTo === input.userId;
    // A chosen attendant who answers a conversation nobody has takes it.
    if (!ownsConversation && !ownsLead) {
      const mayClaim = await seesUnassignedConversations({ tenantId: input.tenantId, userId: input.userId, role });
      const claim = mayClaim
        ? await claimInboxConversation({ tenantId: input.tenantId, userId: input.userId, conversationId: conversation.id })
        : 'taken';
      if (claim === 'taken') throw new WhatsAppOutboundError('FORBIDDEN', 'Agent cannot send in this conversation');
    }
  }

  return {
    conversation,
    sender: {
      id: input.userId,
      name: senderName || '',
    },
  };
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
  template?: WhatsAppOutboundTemplate;
}) {
  const template = normalizeOutboundTemplate(input.template);
  const tenantId = input.tenantId.trim();
  const conversationId = input.conversationId.trim();
  const requestedByUserId = input.requestedByUserId.trim();
  const text = input.text.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!tenantId || !conversationId || !requestedByUserId || !text || !idempotencyKey) {
    throw new WhatsAppOutboundError('INVALID_REQUEST', 'Missing WhatsApp outbound fields');
  }

  const authorization = await assertRequesterCanSend({ tenantId, userId: requestedByUserId, conversationId });
  const conversation = authorization.conversation;
  const recipientWaId = normalizeRecipient(conversation.externalContactIdentity.externalUserId);
  const connection = await resolveConnectedWhatsAppConnection(tenantId);
  const externalMessageId = localExternalMessageId(tenantId, idempotencyKey);
  const fingerprint = requestFingerprint(conversationId,
    template ? `template\u0000${template.name}\u0000${template.language}\u0000${(template.parameters || []).join('\u0001')}` : text);
  const idempotencyKeyHash = sha256(idempotencyKey);

  const existing = await findExistingOutboxMessage(tenantId, externalMessageId);
  if (existing) {
    const metadata = parseOutboxMetadata(existing.metadata);
    if (!metadata || metadata.requestFingerprint !== fingerprint || existing.conversationId !== conversationId) {
      throw new WhatsAppOutboundError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with another payload');
    }
    return { message: existing, metadata, created: false as const };
  }

  const [signatureSettings, previousOutbound] = await Promise.all([
    getWhatsAppAgentSignatureSettings(tenantId),
    prisma.message.findFirst({
      where: {
        tenantId,
        conversationId,
        provider: 'meta',
        channel: 'whatsapp',
        direction: 'outbound',
        status: { in: ['sent', 'delivered', 'read'] },
      },
      orderBy: [
        { providerTimestamp: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      select: { sentByUserId: true },
    }),
  ]);
  const signature = buildPublicAgentSignature({
    mode: signatureSettings.mode,
    senderUserId: authorization.sender.id,
    senderName: authorization.sender.name,
    previousOutboundSenderId: previousOutbound?.sentByUserId || null,
    text,
  });

  const metadata: OutboxMetadata = {
    source: OUTBOX_SOURCE,
    connectionId: connection.id,
    phoneNumberId: connection.phoneNumberId,
    recipientWaId,
    idempotencyKeyHash,
    requestFingerprint: fingerprint,
    dispatchState: 'queued',
    agentSignatureMode: signatureSettings.mode,
    // A template is sent exactly as Meta approved it, so it never carries the attendant's signature.
    ...(signature.signature && !template ? { agentSignature: signature.signature } : {}),
    ...(signature.skippedReason && !template ? { agentSignatureSkippedReason: signature.skippedReason } : {}),
    ...(template ? { template } : {}),
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
      provider_timestamp: Date | null;
      metadata: Prisma.JsonValue | null;
    }>>`
      SELECT id, conversation_id, status, text, sent_by_user_id, provider_timestamp, metadata
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

    const activityAt = parseAcceptedAt(metadata);
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

    if (row.status === 'failed') {
      if (!row.provider_timestamp) {
        await tx.message.update({ where: { id: row.id }, data: { providerTimestamp: activityAt } });
      }
      return { message: { ...row, provider_timestamp: row.provider_timestamp || activityAt }, metadata, finalized: false as const };
    }
    if (row.status === 'sent' || row.status === 'delivered' || row.status === 'read') {
      const message = row.provider_timestamp
        ? row
        : await tx.message.update({ where: { id: row.id }, data: { providerTimestamp: activityAt } });
      return { message, metadata, finalized: false as const };
    }

    const nextMetadata: OutboxMetadata = { ...metadata, dispatchState: 'sent' };
    const message = await tx.message.update({
      where: { id: row.id },
      data: { status: 'sent', providerTimestamp: activityAt, metadata: toJson(nextMetadata) },
    });
    return { message, metadata: nextMetadata, finalized: true as const };
  });
}

async function sendMetaWhatsAppText(input: {
  phoneNumberId: string;
  recipientWaId: string;
  text: string;
  template?: WhatsAppOutboundTemplate;
  accessToken: string;
}) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.phoneNumberId}/messages`);
  const parameters = input.template?.parameters || [];
  const content = input.template
    ? { type: 'template', template: { name: input.template.name, language: { code: input.template.language },
      ...(parameters.length ? { components: [{ type: 'body', parameters: parameters.map(value => ({ type: 'text', text: value })) }] } : {}) } }
    : { type: 'text', text: { preview_url: false, body: input.text } };
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
        ...content,
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
  try {
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
  } catch (error) {
    // Conversion tracking must never turn an already accepted customer message
    // into a failed send response. Tracking can be retried/diagnosed separately.
    console.error('WhatsApp post-send tracking failed', {
      tenantId: input.tenantId,
      messageId: input.messageId,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}

export async function enqueueAndDispatchWhatsAppTextMessage(input: {
  tenantId: string;
  conversationId: string;
  requestedByUserId: string;
  text: string;
  idempotencyKey: string;
  /** When set, this approved template is sent and `text` is only what the Inbox shows. */
  template?: WhatsAppOutboundTemplate;
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
    if (begun.metadata.providerMessageId) {
      await reconcileBufferedWhatsAppStatusesForMessage({
        tenantId: input.tenantId,
        providerMessageId: begun.metadata.providerMessageId,
      });
    }
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
    select: { id: true, accessTokenEncrypted: true },
  });
  if (!connection) {
    await markProviderRejected({ tenantId: input.tenantId, messageId: begun.row.id, errorCode: 'connection_revoked' });
    return { status: 'failed', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }

  // The customer's own token when the connection has one; the platform credential otherwise.
  const ownToken = connectionAccessToken(connection.accessTokenEncrypted);
  const credentials = ownToken ? null : await getPlatformWhatsAppSendCredentials();
  const accessToken = ownToken || credentials?.systemUserAccessToken;
  if (!accessToken) {
    await markProviderRejected({ tenantId: input.tenantId, messageId: begun.row.id, errorCode: 'runtime_credentials_missing' });
    return { status: 'failed', messageId: begun.row.id, providerMessageId: null, idempotent: !queued.created };
  }

  const providerText = begun.metadata.agentSignature
    ? `${begun.metadata.agentSignature}\n${begun.row.text || ''}`
    : begun.row.text || '';
  const provider = await sendMetaWhatsAppText({
    phoneNumberId: begun.metadata.phoneNumberId,
    recipientWaId: begun.metadata.recipientWaId,
    text: providerText,
    template: begun.metadata.template,
    accessToken,
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
  await reconcileBufferedWhatsAppStatusesForMessage({
    tenantId: input.tenantId,
    providerMessageId: provider.providerMessageId,
  });
  const finalized = await finalizeAcceptedMessage({ tenantId: input.tenantId, messageId: begun.row.id });

  // This is the request that actually contacted Meta, so run tracking once here.
  // The helper is best-effort and cannot change the successful send result.
  await runTrackingAfterSend({
    tenantId: input.tenantId,
    conversationId: begun.row.conversation_id,
    messageId: begun.row.id,
    providerMessageId: provider.providerMessageId,
    text: begun.row.text || '',
    sentByUserId: begun.row.sent_by_user_id,
    recipientWaId: begun.metadata.recipientWaId,
  });

  return {
    status: finalized.message.status === 'failed' ? 'failed' : 'sent',
    messageId: begun.row.id,
    providerMessageId: provider.providerMessageId,
    idempotent: !queued.created,
  };
}

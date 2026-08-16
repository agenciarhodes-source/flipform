import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MessageStatus, MessageType, recordInboundMessage, recordOutboundMessage } from '@/lib/conversations/core';
import { createAppSecretProof, META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';
import { getPlatformWhatsAppCloudRuntimeCredentials } from '@/lib/meta/whatsapp-runtime-credentials';
import { processWhatsAppFunnelMessage } from '@/lib/tracking/whatsapp-funnel';

const GRAPH_HOST = 'graph.facebook.com';
const REQUEST_TIMEOUT_MS = 10_000;
const STATUS_RANK: Record<string, number> = {
  received: 0,
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return constantTimeEqual(expected, signatureHeader);
}

export function verifyWhatsAppWebhookChallenge(input: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  configuredVerifyToken: string;
}) {
  return input.mode === 'subscribe'
    && Boolean(input.challenge)
    && Boolean(input.verifyToken)
    && constantTimeEqual(input.verifyToken || '', input.configuredVerifyToken);
}

function parseProviderTimestamp(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const parsed = new Date(seconds * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMessageType(type: unknown): MessageType {
  if (type === 'text' || type === 'image' || type === 'audio' || type === 'video' || type === 'document' || type === 'sticker' || type === 'interactive') {
    return type;
  }
  return type === 'button' ? 'interactive' : 'unknown';
}

function normalizeMessageText(message: any): string | null {
  if (typeof message?.text?.body === 'string') return message.text.body;
  if (typeof message?.button?.text === 'string') return message.button.text;
  if (typeof message?.interactive?.button_reply?.title === 'string') return message.interactive.button_reply.title;
  if (typeof message?.interactive?.list_reply?.title === 'string') return message.interactive.list_reply.title;
  if (typeof message?.image?.caption === 'string') return message.image.caption;
  if (typeof message?.video?.caption === 'string') return message.video.caption;
  if (typeof message?.document?.caption === 'string') return message.document.caption;
  if (typeof message?.reaction?.emoji === 'string') return message.reaction.emoji;
  return null;
}

function normalizedMessageMetadata(input: { entryId: string | null; phoneNumberId: string; value: any; message: any }): Prisma.InputJsonValue {
  const message = input.message;
  const media = message?.image || message?.audio || message?.video || message?.document || message?.sticker;
  return {
    source: 'meta_whatsapp_cloud_api',
    phoneNumberId: input.phoneNumberId,
    ...(input.entryId ? { wabaId: input.entryId } : {}),
    ...(typeof input.value?.metadata?.display_phone_number === 'string' ? { displayPhoneNumber: input.value.metadata.display_phone_number } : {}),
    ...(typeof message?.type === 'string' ? { providerType: message.type } : {}),
    ...(typeof message?.context?.id === 'string' ? { contextMessageId: message.context.id } : {}),
    ...(typeof media?.id === 'string' ? { mediaId: media.id } : {}),
    ...(typeof message?.interactive?.button_reply?.id === 'string' ? { interactiveReplyId: message.interactive.button_reply.id } : {}),
    ...(typeof message?.interactive?.list_reply?.id === 'string' ? { interactiveReplyId: message.interactive.list_reply.id } : {}),
  };
}

async function resolveConnectedWhatsAppTenant(phoneNumberId: string) {
  const connection = await prisma.tenantWhatsAppConnection.findUnique({
    where: { phoneNumberId },
    select: { id: true, tenantId: true, phoneNumberId: true, status: true },
  });
  if (!connection || connection.status !== 'connected') return null;
  return connection;
}

export async function applyWhatsAppMessageStatus(input: {
  tenantId: string;
  externalMessageId: string;
  status: string;
}) {
  if (!['sent', 'delivered', 'read', 'failed'].includes(input.status)) return { updated: false, reason: 'unsupported_status' as const };

  return prisma.$transaction(async tx => {
    const message = await tx.message.findFirst({
      where: {
        tenantId: input.tenantId,
        provider: 'meta',
        channel: 'whatsapp',
        externalMessageId: input.externalMessageId,
      },
      select: { id: true, status: true },
    });
    if (!message) return { updated: false, reason: 'message_not_found' as const };

    if (input.status === 'failed') {
      if (message.status === 'delivered' || message.status === 'read') return { updated: false, reason: 'would_downgrade' as const };
      if (message.status === 'failed') return { updated: false, reason: 'duplicate_status' as const };
      await tx.message.update({ where: { id: message.id }, data: { status: 'failed' } });
      return { updated: true, reason: 'failed' as const };
    }

    const currentRank = STATUS_RANK[message.status] ?? -1;
    const nextRank = STATUS_RANK[input.status] ?? -1;
    if (message.status !== 'failed' && nextRank <= currentRank) return { updated: false, reason: 'duplicate_or_older_status' as const };

    await tx.message.update({ where: { id: message.id }, data: { status: input.status } });
    return { updated: true, reason: 'advanced' as const };
  });
}

export async function processWhatsAppCloudWebhook(payload: any) {
  const result = {
    messagesCreated: 0,
    duplicateMessages: 0,
    statusesUpdated: 0,
    ignored: 0,
  };

  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return result;
  }

  for (const entry of payload.entry) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== 'messages') continue;
      const value = change?.value;
      const phoneNumberId = typeof value?.metadata?.phone_number_id === 'string' ? value.metadata.phone_number_id : '';
      if (!phoneNumberId) {
        result.ignored += 1;
        continue;
      }

      const connection = await resolveConnectedWhatsAppTenant(phoneNumberId);
      if (!connection) {
        result.ignored += 1;
        continue;
      }

      const contacts = new Map<string, string | null>();
      for (const contact of Array.isArray(value?.contacts) ? value.contacts : []) {
        if (typeof contact?.wa_id !== 'string') continue;
        contacts.set(contact.wa_id, typeof contact?.profile?.name === 'string' ? contact.profile.name : null);
      }

      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        if (typeof message?.id !== 'string' || typeof message?.from !== 'string') {
          result.ignored += 1;
          continue;
        }
        const persisted = await recordInboundMessage({
          tenantId: connection.tenantId,
          channel: 'whatsapp',
          provider: 'meta',
          externalUserId: message.from,
          externalMessageId: message.id,
          displayName: contacts.get(message.from) ?? null,
          phone: message.from,
          text: normalizeMessageText(message),
          type: normalizeMessageType(message.type),
          providerTimestamp: parseProviderTimestamp(message.timestamp),
          metadata: normalizedMessageMetadata({
            entryId: typeof entry?.id === 'string' ? entry.id : null,
            phoneNumberId,
            value,
            message,
          }),
        });
        if (persisted.duplicate) result.duplicateMessages += 1;
        else result.messagesCreated += 1;
      }

      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
        if (typeof status?.id !== 'string' || typeof status?.status !== 'string') {
          result.ignored += 1;
          continue;
        }
        const applied = await applyWhatsAppMessageStatus({
          tenantId: connection.tenantId,
          externalMessageId: status.id,
          status: status.status,
        });
        if (applied.updated) result.statusesUpdated += 1;
      }
    }
  }

  return result;
}

export async function sendWhatsAppTextMessage(input: {
  tenantId: string;
  conversationId: string;
  text: string;
  sentByUserId?: string | null;
}) {
  const text = input.text.trim();
  if (!text) throw new Error('WhatsApp message text is required');
  if (text.length > 4096) throw new Error('WhatsApp message text is too long');

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      tenantId: input.tenantId,
      provider: 'meta',
      channel: 'whatsapp',
    },
    include: { externalContactIdentity: true },
  });
  if (!conversation) throw new Error('WhatsApp conversation not found for tenant');

  if (input.sentByUserId) {
    const membership = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, userId: input.sentByUserId, status: 'active' },
      select: { id: true },
    });
    if (!membership) throw new Error('Sender is not an active tenant user');
  }

  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId: input.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true, phoneNumberId: true },
  });
  if (!connection) throw new Error('WhatsApp is not connected for tenant');

  const credentials = await getPlatformWhatsAppCloudRuntimeCredentials();
  if (!credentials) throw new Error('WhatsApp Cloud API runtime is not configured');

  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${connection.phoneNumberId}/messages`);
  url.searchParams.set('appsecret_proof', createAppSecretProof(credentials.systemUserAccessToken, credentials.appSecret));

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${credentials.systemUserAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: conversation.externalContactIdentity.externalUserId,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
  } catch {
    throw new Error('Meta WhatsApp send unavailable');
  }

  const data = await response.json().catch(() => null);
  const externalMessageId = typeof data?.messages?.[0]?.id === 'string' ? data.messages[0].id : null;
  if (!response.ok || data?.error || !externalMessageId) {
    console.error('Meta WhatsApp send failed', {
      tenantId: input.tenantId,
      httpStatus: response.status,
      metaCode: data?.error?.code,
      metaType: data?.error?.type,
    });
    throw new Error('Meta WhatsApp send failed');
  }

  const persisted = await recordOutboundMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    externalMessageId,
    text,
    type: 'text',
    status: 'sent' as MessageStatus,
    sentByUserId: input.sentByUserId ?? null,
    providerTimestamp: new Date(),
    metadata: {
      source: 'meta_whatsapp_cloud_api',
      connectionId: connection.id,
      phoneNumberId: connection.phoneNumberId,
    },
  });

  await processWhatsAppFunnelMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    messageId: persisted.message.id,
    leadId: conversation.leadId || conversation.externalContactIdentity.leadId || null,
    phone: conversation.externalContactIdentity.phone,
    name: conversation.externalContactIdentity.displayName,
    email: conversation.externalContactIdentity.email,
    text,
    direction: 'outbound',
    senderType: input.sentByUserId ? 'agent' : 'system',
    timestamp: persisted.message.providerTimestamp?.toISOString() || null,
    metadata: { externalMessageId },
  });

  return persisted;
}

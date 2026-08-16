import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MessageType, recordInboundMessage } from '@/lib/conversations/core';

const STATUS_RANK: Record<string, number> = {
  received: 0,
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};
const STATUS_BUFFER_PROVIDER = 'meta_whatsapp_status_buffer';
const STATUS_BUFFER_EVENT_TYPE = 'whatsapp_message_status';

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

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  providerTimestamp?: Date | null;
}) {
  if (!['sent', 'delivered', 'read', 'failed'].includes(input.status)) return { updated: false, reason: 'unsupported_status' as const };

  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      metadata: Prisma.JsonValue | null;
    }>>`
      SELECT id, status, metadata
      FROM public.messages
      WHERE tenant_id = ${input.tenantId}
        AND provider = 'meta'
        AND channel = 'whatsapp'
        AND (
          external_message_id = ${input.externalMessageId}
          OR metadata->>'providerMessageId' = ${input.externalMessageId}
        )
      ORDER BY CASE WHEN external_message_id = ${input.externalMessageId} THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE
    `;
    const message = locked[0];
    if (!message) return { updated: false, reason: 'message_not_found' as const };

    const metadata = jsonObject(message.metadata);
    const isOutbox = metadata.source === 'flipform_whatsapp_outbox';
    const statusAt = (input.providerTimestamp || new Date()).toISOString();

    if (input.status === 'failed') {
      if (message.status === 'delivered' || message.status === 'read') return { updated: false, reason: 'would_downgrade' as const };
      if (message.status === 'failed') return { updated: false, reason: 'duplicate_status' as const };
      await tx.message.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          ...(isOutbox ? {
            metadata: {
              ...metadata,
              dispatchState: 'failed',
              providerStatusAt: statusAt,
            } as Prisma.InputJsonValue,
          } : {}),
        },
      });
      return { updated: true, reason: 'failed' as const };
    }

    const currentRank = STATUS_RANK[message.status] ?? -1;
    const nextRank = STATUS_RANK[input.status] ?? -1;
    if (message.status !== 'failed' && nextRank <= currentRank) return { updated: false, reason: 'duplicate_or_older_status' as const };

    await tx.message.update({
      where: { id: message.id },
      data: {
        status: input.status,
        ...(isOutbox ? {
          metadata: {
            ...metadata,
            dispatchState: input.status,
            providerStatusAt: statusAt,
          } as Prisma.InputJsonValue,
        } : {}),
      },
    });

    // Delivery/read receipts describe receipt time, not message activity time.
    // Conversation ordering is advanced only by message ingestion/send finalization.
    return { updated: true, reason: 'advanced' as const };
  });
}

function bufferedStatusEventId(input: {
  tenantId: string;
  externalMessageId: string;
  status: string;
  providerTimestamp: Date | null;
}) {
  return createHash('sha256')
    .update(`${input.tenantId}\u0000${input.externalMessageId}\u0000${input.status}\u0000${input.providerTimestamp?.toISOString() || ''}`, 'utf8')
    .digest('hex');
}

async function bufferUnmatchedWhatsAppStatus(input: {
  tenantId: string;
  externalMessageId: string;
  status: string;
  providerTimestamp: Date | null;
  phoneNumberId: string;
}) {
  const eventId = bufferedStatusEventId(input);
  const event = await prisma.webhookEvent.upsert({
    where: { provider_eventId: { provider: STATUS_BUFFER_PROVIDER, eventId } },
    create: {
      provider: STATUS_BUFFER_PROVIDER,
      eventId,
      eventType: STATUS_BUFFER_EVENT_TYPE,
      tenantId: input.tenantId,
      rawPayload: {
        externalMessageId: input.externalMessageId,
        status: input.status,
        providerTimestamp: input.providerTimestamp?.toISOString() || null,
        phoneNumberId: input.phoneNumberId,
      } as Prisma.InputJsonValue,
      processedAt: null,
    },
    update: {},
    select: { id: true },
  });
  return event.id;
}

async function markBufferedStatusProcessed(id: string, tenantId: string) {
  await prisma.webhookEvent.updateMany({
    where: {
      id,
      tenantId,
      provider: STATUS_BUFFER_PROVIDER,
      eventType: STATUS_BUFFER_EVENT_TYPE,
      processedAt: null,
    },
    data: { processedAt: new Date() },
  });
}

export async function reconcileBufferedWhatsAppStatusesForMessage(input: {
  tenantId: string;
  providerMessageId: string;
}) {
  const buffered = await prisma.$queryRaw<Array<{ id: string; raw_payload: Prisma.JsonValue | null }>>`
    SELECT id, raw_payload
    FROM public.webhook_events
    WHERE tenant_id = ${input.tenantId}
      AND provider = ${STATUS_BUFFER_PROVIDER}
      AND event_type = ${STATUS_BUFFER_EVENT_TYPE}
      AND processed_at IS NULL
      AND raw_payload->>'externalMessageId' = ${input.providerMessageId}
    ORDER BY created_at ASC
    LIMIT 50
  `;

  let reconciled = 0;
  for (const item of buffered) {
    const payload = jsonObject(item.raw_payload);
    if (typeof payload.externalMessageId !== 'string' || typeof payload.status !== 'string') continue;
    const providerTimestamp = typeof payload.providerTimestamp === 'string'
      ? new Date(payload.providerTimestamp)
      : null;
    const validTimestamp = providerTimestamp && !Number.isNaN(providerTimestamp.getTime()) ? providerTimestamp : null;
    const applied = await applyWhatsAppMessageStatus({
      tenantId: input.tenantId,
      externalMessageId: payload.externalMessageId,
      status: payload.status,
      providerTimestamp: validTimestamp,
    });
    if (applied.reason !== 'message_not_found') {
      await markBufferedStatusProcessed(item.id, input.tenantId);
      reconciled += 1;
    }
  }
  return reconciled;
}

export async function processWhatsAppCloudWebhook(payload: any) {
  const result = {
    messagesCreated: 0,
    duplicateMessages: 0,
    statusesUpdated: 0,
    statusesBuffered: 0,
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
        const providerTimestamp = parseProviderTimestamp(status.timestamp);
        let applied = await applyWhatsAppMessageStatus({
          tenantId: connection.tenantId,
          externalMessageId: status.id,
          status: status.status,
          providerTimestamp,
        });

        if (applied.reason === 'message_not_found') {
          const bufferedId = await bufferUnmatchedWhatsAppStatus({
            tenantId: connection.tenantId,
            externalMessageId: status.id,
            status: status.status,
            providerTimestamp,
            phoneNumberId,
          });
          result.statusesBuffered += 1;

          // Close the opposite race: provider ID may have committed while this
          // webhook was buffering the previously unmatched receipt.
          const retried = await applyWhatsAppMessageStatus({
            tenantId: connection.tenantId,
            externalMessageId: status.id,
            status: status.status,
            providerTimestamp,
          });
          if (retried.reason !== 'message_not_found') {
            await markBufferedStatusProcessed(bufferedId, connection.tenantId);
            applied = retried;
          }
        }

        if (applied.updated) result.statusesUpdated += 1;
      }
    }
  }

  return result;
}

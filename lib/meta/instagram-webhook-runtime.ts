import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordInboundMessage, type MessageType } from '@/lib/conversations/core';

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyInstagramWebhookChallenge(input: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  configuredVerifyToken: string;
}) {
  if (input.mode !== 'subscribe' || !input.verifyToken || input.challenge == null) return false;
  return safeEqual(input.verifyToken, input.configuredVerifyToken);
}

export function verifyInstagramWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const signature = signatureHeader.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(signature, expected);
}

function stringId(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function providerTimestamp(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedAttachmentType(attachment: any): MessageType {
  const type = typeof attachment?.type === 'string' ? attachment.type : '';
  if (type === 'image') return attachment?.payload?.sticker_id ? 'sticker' : 'image';
  if (type === 'audio') return 'audio';
  if (type === 'video') return 'video';
  if (type === 'file') return 'document';
  return 'unknown';
}

function normalizeInstagramMessage(message: any, instagramProfessionalAccountId: string) {
  const text = typeof message?.text === 'string' ? message.text : null;
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const type: MessageType = text !== null
    ? 'text'
    : attachments.length
      ? normalizedAttachmentType(attachments[0])
      : 'unknown';
  const attachmentTypes = attachments
    .map((attachment: any) => typeof attachment?.type === 'string' ? attachment.type : null)
    .filter((value: string | null): value is string => Boolean(value));

  return {
    text,
    type,
    metadata: {
      instagramProfessionalAccountId,
      providerType: text !== null ? 'text' : attachmentTypes[0] || 'unknown',
      attachmentTypes,
      ...(typeof message?.quick_reply?.payload === 'string'
        ? { quickReplyPayload: message.quick_reply.payload }
        : {}),
      ...(stringId(message?.reply_to?.mid)
        ? { contextMessageId: stringId(message.reply_to.mid) as string }
        : {}),
      ...(stringId(message?.reply_to?.story?.id)
        ? { replyToStoryId: stringId(message.reply_to.story.id) as string }
        : {}),
    },
  };
}

async function resolveConnectedInstagramTenant(instagramUserId: string) {
  const connection = await prisma.tenantInstagramConnection.findUnique({
    where: { instagramUserId },
    select: { tenantId: true, status: true, revokedAt: true },
  });
  if (!connection || connection.status !== 'connected' || connection.revokedAt) return null;
  return connection;
}

export async function processInstagramWebhook(payload: unknown) {
  const result = {
    entries: 0,
    inbound: 0,
    duplicates: 0,
    echoes: 0,
    ignored: 0,
  };

  if (!payload || typeof payload !== 'object' || (payload as any).object !== 'instagram') return result;
  const entries = Array.isArray((payload as any).entry) ? (payload as any).entry : [];

  for (const entry of entries) {
    result.entries += 1;
    const instagramProfessionalAccountId = stringId(entry?.id);
    const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
    if (!instagramProfessionalAccountId) {
      result.ignored += events.length;
      continue;
    }

    const connection = await resolveConnectedInstagramTenant(instagramProfessionalAccountId);
    if (!connection) {
      result.ignored += events.length;
      continue;
    }

    for (const event of events) {
      const message = event?.message;
      const externalMessageId = stringId(message?.mid);
      const senderId = stringId(event?.sender?.id);
      const recipientId = stringId(event?.recipient?.id);

      if (!message || !externalMessageId || !senderId || !recipientId) {
        result.ignored += 1;
        continue;
      }

      if (message?.is_echo === true || senderId === instagramProfessionalAccountId) {
        result.echoes += 1;
        continue;
      }

      if (recipientId !== instagramProfessionalAccountId) {
        result.ignored += 1;
        continue;
      }

      const normalized = normalizeInstagramMessage(message, instagramProfessionalAccountId);
      const persisted = await recordInboundMessage({
        tenantId: connection.tenantId,
        provider: 'meta',
        channel: 'instagram',
        externalUserId: senderId,
        externalMessageId,
        text: normalized.text,
        type: normalized.type,
        providerTimestamp: providerTimestamp(event?.timestamp),
        metadata: normalized.metadata,
      });

      if (persisted.duplicate) result.duplicates += 1;
      else result.inbound += 1;
    }
  }

  return result;
}

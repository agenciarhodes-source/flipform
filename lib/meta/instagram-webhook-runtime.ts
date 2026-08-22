import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordInboundMessage, type MessageType } from '@/lib/conversations/core';
import { enqueueInstagramCommentCoreAutomation } from '@/lib/automation/adapters/instagram-comment';
import {
  enqueueInstagramMessageCoreAutomation,
  prepareInstagramMessageCoreAutomation,
} from '@/lib/automation/adapters/instagram-message';
import { prepareInstagramCommentCoreCutover } from '@/lib/automation/bridges/instagram-comment-core-cutover';

const INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION = 'INSTAGRAM_WEBHOOK_SUBSCRIBED';
const INSTAGRAM_COMMENT_EVENT_PROVIDER = 'instagram_comment';
const INSTAGRAM_COMMENT_FIELDS = ['comments', 'live_comments'] as const;
type InstagramCommentField = (typeof INSTAGRAM_COMMENT_FIELDS)[number];

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
  // Meta webhook examples are not fully uniform: some timestamps are Unix seconds,
  // while messaging payloads commonly use milliseconds. Normalize both safely.
  const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
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
  const attachments = Array.isArray(message?.attachments) ? message?.attachments : [];
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

function subscriptionFields(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [] as string[];
  const fields = (metadata as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return [] as string[];
  return fields.filter((field): field is string => typeof field === 'string');
}

async function resolveConnectedInstagramTenant(instagramUserId: string) {
  const connection = await prisma.tenantInstagramConnection.findUnique({
    where: { instagramUserId },
    select: { id: true, tenantId: true, status: true, revokedAt: true, connectedAt: true },
  });
  if (!connection || connection.status !== 'connected' || connection.revokedAt) return null;

  const webhookSubscription = await prisma.auditLog.findFirst({
    where: {
      tenantId: connection.tenantId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION,
      createdAt: { gte: connection.connectedAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, metadata: true },
  });
  if (!webhookSubscription) return null;

  return {
    ...connection,
    webhookFields: subscriptionFields(webhookSubscription.metadata),
  };
}

function isInstagramCommentField(value: unknown): value is InstagramCommentField {
  return typeof value === 'string'
    && INSTAGRAM_COMMENT_FIELDS.some(field => field === value);
}

function collectInstagramCommentChanges(entry: any) {
  const changes: Array<{ field: InstagramCommentField; value: any }> = [];

  if (isInstagramCommentField(entry?.field)) {
    changes.push({ field: entry.field, value: entry?.value });
  }

  if (Array.isArray(entry?.changes)) {
    for (const change of entry.changes) {
      if (isInstagramCommentField(change?.field)) {
        changes.push({ field: change.field, value: change?.value });
      }
    }
  }

  return changes;
}

function normalizeInstagramComment(input: {
  field: InstagramCommentField;
  value: any;
  instagramProfessionalAccountId: string;
  entryTime: unknown;
}) {
  const commentId = stringId(input.value?.id);
  if (!commentId) return null;

  const commenterInstagramScopedId = stringId(input.value?.from?.id);
  const selfInstagramScopedId = stringId(input.value?.from?.self_ig_scoped_id);
  const commenterUsername = typeof input.value?.from?.username === 'string'
    ? input.value.from.username.trim() || null
    : null;
  const text = typeof input.value?.text === 'string' ? input.value.text : null;
  const mediaId = stringId(input.value?.media?.id);
  const mediaProductType = typeof input.value?.media?.media_product_type === 'string'
    ? input.value.media.media_product_type
    : null;
  const occurredAt = providerTimestamp(input.entryTime);
  const isSelf = commenterInstagramScopedId === input.instagramProfessionalAccountId
    || Boolean(selfInstagramScopedId);

  return {
    commentId,
    field: input.field,
    commenterInstagramScopedId,
    commenterUsername,
    text,
    mediaId,
    mediaProductType,
    occurredAt,
    isSelf,
  };
}

async function persistInstagramCommentEvent(input: {
  tenantId: string;
  instagramProfessionalAccountId: string;
  comment: NonNullable<ReturnType<typeof normalizeInstagramComment>>;
}) {
  const eventId = `${input.instagramProfessionalAccountId}:${input.comment.commentId}`;
  const commentText = input.comment.field === 'comments' && input.comment.text
    ? input.comment.text
    : null;
  const preparedAutomation = commentText
    ? await prepareInstagramCommentCoreCutover({
      tenantId: input.tenantId,
      text: commentText,
    })
    : null;

  try {
    return await prisma.$transaction(async tx => {
      const event = await tx.webhookEvent.create({
        data: {
          provider: INSTAGRAM_COMMENT_EVENT_PROVIDER,
          eventId,
          eventType: input.comment.field,
          tenantId: input.tenantId,
          processedAt: new Date(),
          rawPayload: {
            instagramProfessionalAccountId: input.instagramProfessionalAccountId,
            commentId: input.comment.commentId,
            commenterInstagramScopedId: input.comment.commenterInstagramScopedId,
            commenterUsername: input.comment.commenterUsername,
            text: input.comment.text,
            mediaId: input.comment.mediaId,
            mediaProductType: input.comment.mediaProductType,
            occurredAt: input.comment.occurredAt?.toISOString() || null,
          },
        },
        select: { id: true },
      });

      if (preparedAutomation && commentText) {
        await enqueueInstagramCommentCoreAutomation(tx, {
          tenantId: input.tenantId,
          sourceEventKey: eventId,
          sourceCommentEventId: event.id,
          commentText,
          prepared: preparedAutomation,
        });
      }

      return {
        duplicate: false as const,
        automationQueued: Boolean(preparedAutomation && commentText),
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { duplicate: true as const, automationQueued: false as const };
    }
    throw error;
  }
}

export async function processInstagramWebhook(payload: unknown) {
  const result = {
    entries: 0,
    inbound: 0,
    duplicates: 0,
    echoes: 0,
    comments: 0,
    commentDuplicates: 0,
    selfComments: 0,
    automationsQueued: 0,
    messageAutomationsQueued: 0,
    ignored: 0,
  };

  if (!payload || typeof payload !== 'object' || (payload as any).object !== 'instagram') return result;
  const entries = Array.isArray((payload as any).entry) ? (payload as any).entry : [];

  for (const entry of entries) {
    result.entries += 1;
    const instagramProfessionalAccountId = stringId(entry?.id);
    const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];
    const commentChanges = collectInstagramCommentChanges(entry);

    if (!instagramProfessionalAccountId) {
      result.ignored += messagingEvents.length + commentChanges.length;
      continue;
    }

    const connection = await resolveConnectedInstagramTenant(instagramProfessionalAccountId);
    if (!connection) {
      result.ignored += messagingEvents.length + commentChanges.length;
      continue;
    }

    if (connection.webhookFields.includes('messages')) {
      for (const event of messagingEvents) {
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
        const preparedAutomation = normalized.text
          ? await prepareInstagramMessageCoreAutomation({
            tenantId: connection.tenantId,
            text: normalized.text,
          })
          : null;
        let automationQueued = false;

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
        }, preparedAutomation && normalized.text ? {
          onCreated: async (tx, created) => {
            await enqueueInstagramMessageCoreAutomation(tx, {
              tenantId: connection.tenantId,
              sourceEventKey: `meta-instagram:${instagramProfessionalAccountId}:${externalMessageId}`,
              sourceMessageId: externalMessageId,
              conversationId: created.conversationId,
              messageText: normalized.text as string,
              prepared: preparedAutomation,
            });
            automationQueued = true;
          },
        } : undefined);

        if (persisted.duplicate) result.duplicates += 1;
        else {
          result.inbound += 1;
          if (automationQueued) {
            result.messageAutomationsQueued += 1;
            result.automationsQueued += 1;
          }
        }
      }
    } else {
      result.ignored += messagingEvents.length;
    }

    for (const change of commentChanges) {
      if (!connection.webhookFields.includes(change.field)) {
        result.ignored += 1;
        continue;
      }

      const comment = normalizeInstagramComment({
        field: change.field,
        value: change.value,
        instagramProfessionalAccountId,
        entryTime: entry?.time,
      });
      if (!comment) {
        result.ignored += 1;
        continue;
      }
      if (comment.isSelf) {
        result.selfComments += 1;
        continue;
      }

      const persisted = await persistInstagramCommentEvent({
        tenantId: connection.tenantId,
        instagramProfessionalAccountId,
        comment,
      });
      if (persisted.duplicate) result.commentDuplicates += 1;
      else result.comments += 1;
      if (persisted.automationQueued) result.automationsQueued += 1;
    }
  }

  return result;
}

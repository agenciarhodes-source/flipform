import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { FlipAiChatAttachment } from './chat-attachment';

/**
 * Temporary storage of the photos and documents visitors attach in the chat.
 *
 * A file is kept for a few days so the team can download it from the lead, and is then
 * deleted for good. Nothing here is permanent storage, and a failure to store never
 * interrupts the conversation.
 */

export const FLIP_AI_ATTACHMENT_RETENTION_DAYS = 7;
const RETENTION_MS = FLIP_AI_ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type StoredChatAttachmentInfo = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
};

function isSchemaPending(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2021' || error.code === 'P2022');
}

/** Deletes every file whose retention ended. Safe to call often: it only touches expired rows. */
export async function purgeExpiredChatAttachments(now = new Date()) {
  try {
    const removed = await prisma.chatAttachment.deleteMany({ where: { expiresAt: { lte: now } } });
    return { removed: removed.count, available: true };
  } catch (error) {
    if (isSchemaPending(error)) return { removed: 0, available: false };
    throw error;
  }
}

export async function storeChatAttachment(input: {
  tenantId: string;
  conversationId: string;
  clientMessageId: string;
  attachment: FlipAiChatAttachment;
  now?: Date;
}) {
  const now = input.now || new Date();
  try {
    // Every new file is also the moment old ones are cleared, so expiry does not depend on a scheduler.
    await purgeExpiredChatAttachments(now);
    await prisma.chatAttachment.upsert({
      where: {
        conversationId_clientMessageId: {
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      },
      // A retried message keeps the first copy and its original expiry.
      update: {},
      create: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        name: input.attachment.name,
        mimeType: input.attachment.mimeType,
        sizeBytes: input.attachment.sizeBytes,
        content: Buffer.from(input.attachment.base64, 'base64'),
        expiresAt: new Date(now.getTime() + RETENTION_MS),
      },
      select: { id: true },
    });
    return { stored: true as const };
  } catch {
    // Storage not applied yet or temporarily unavailable: the attendant still reads the file.
    return { stored: false as const };
  }
}

/** Files of the lead's conversations that are still within retention, newest first. */
export async function listLeadChatAttachments(input: { tenantId: string; leadId: string; now?: Date }): Promise<StoredChatAttachmentInfo[]> {
  const now = input.now || new Date();
  try {
    const conversations = await prisma.conversation.findMany({
      where: { tenantId: input.tenantId, leadId: input.leadId },
      select: { id: true },
    });
    if (!conversations.length) return [];
    const rows = await prisma.chatAttachment.findMany({
      where: {
        tenantId: input.tenantId,
        conversationId: { in: conversations.map((conversation) => conversation.id) },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, expiresAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  } catch (error) {
    if (isSchemaPending(error)) return [];
    throw error;
  }
}

/** The file itself, only when it belongs to a conversation of that lead and has not expired. */
export async function loadLeadChatAttachment(input: {
  tenantId: string;
  leadId: string;
  attachmentId: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const row = await prisma.chatAttachment.findFirst({
    where: { id: input.attachmentId, tenantId: input.tenantId, expiresAt: { gt: now } },
    select: { id: true, conversationId: true, name: true, mimeType: true, sizeBytes: true, content: true },
  });
  if (!row) return null;
  const conversation = await prisma.conversation.findFirst({
    where: { id: row.conversationId, tenantId: input.tenantId, leadId: input.leadId },
    select: { id: true },
  });
  return conversation ? row : null;
}

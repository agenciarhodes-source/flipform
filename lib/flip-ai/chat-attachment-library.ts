import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  createAttachmentDownloadUrl,
  deleteAttachmentObject,
  resolveAttachmentStorage,
} from '@/lib/storage/attachment-storage';

/**
 * The files a lead sent in the chat, as the team sees them: listed on the lead while they are
 * within retention, downloadable through a one-minute link, and removable by senior roles.
 */

/** Roles allowed to delete a file before it expires. Attendants can only download. */
export const CHAT_ATTACHMENT_DELETE_ROLES: readonly string[] = ['owner', 'admin', 'manager'];

export function canDeleteChatAttachment(role: string) {
  return CHAT_ATTACHMENT_DELETE_ROLES.includes(role);
}

export type LeadChatAttachment = {
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

async function leadConversationIds(tenantId: string, leadId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { tenantId, leadId },
    select: { id: true },
  });
  return conversations.map((conversation) => conversation.id);
}

/** Files of the lead's conversations that were accepted and have not expired, newest first. */
export async function listLeadChatAttachments(input: { tenantId: string; leadId: string; now?: Date }): Promise<LeadChatAttachment[]> {
  const now = input.now || new Date();
  try {
    const conversationIds = await leadConversationIds(input.tenantId, input.leadId);
    if (!conversationIds.length) return [];
    const rows = await prisma.chatAttachment.findMany({
      where: {
        tenantId: input.tenantId,
        conversationId: { in: conversationIds },
        status: 'ready',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
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

/** One available file, only when it belongs to a conversation of that lead in that company. */
async function findLeadChatAttachment(input: { tenantId: string; leadId: string; attachmentId: string; now: Date }) {
  const conversationIds = await leadConversationIds(input.tenantId, input.leadId);
  if (!conversationIds.length) return null;
  return prisma.chatAttachment.findFirst({
    where: {
      id: input.attachmentId,
      tenantId: input.tenantId,
      conversationId: { in: conversationIds },
      status: 'ready',
      expiresAt: { gt: input.now },
    },
    select: { id: true, objectKey: true, name: true, mimeType: true, sizeBytes: true },
  });
}

/** A link, valid for one minute, that makes the browser download the file under its own name. */
export async function createLeadChatAttachmentDownload(input: {
  tenantId: string;
  leadId: string;
  attachmentId: string;
  now?: Date;
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) return null;
  const file = await findLeadChatAttachment({ ...input, now: input.now || new Date() });
  if (!file) return null;
  return {
    id: file.id,
    name: file.name,
    sizeBytes: file.sizeBytes,
    url: createAttachmentDownloadUrl(storage.config, { key: file.objectKey, downloadName: file.name, now: input.now }),
  };
}

/** Removes the file from storage for good and keeps only the record that it existed. */
export async function deleteLeadChatAttachment(input: {
  tenantId: string;
  leadId: string;
  attachmentId: string;
  userId: string;
  now?: Date;
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) return null;
  const now = input.now || new Date();
  const file = await findLeadChatAttachment({ ...input, now });
  if (!file) return null;
  // Storage first: if it fails, the record keeps saying the file is available, which is true.
  await deleteAttachmentObject(storage.config, { key: file.objectKey });
  await prisma.chatAttachment.updateMany({
    where: { id: file.id, tenantId: input.tenantId },
    data: { status: 'deleted', deletedAt: now, deletedById: input.userId },
  });
  return { id: file.id, name: file.name };
}

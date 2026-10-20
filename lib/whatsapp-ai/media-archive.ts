import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { createAttachmentUploadUrl, resolveAttachmentStorage } from '@/lib/storage/attachment-storage';
import { sniffAttachmentMimeType } from '@/lib/flip-ai/chat-attachment';
import { FLIP_AI_ATTACHMENT_RETENTION_DAYS } from '@/lib/flip-ai/chat-attachment-upload';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import { downloadWhatsAppMedia } from '@/lib/meta/whatsapp-media';

/** WhatsApp files are larger than the ones sent in the site chat; the R2 copy accepts up to this. */
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
};
const LABELS: Record<string, string> = { image: 'foto', document: 'documento', audio: 'audio' };

export type WhatsAppMediaToArchive = { tenantId: string; connectionId: string; conversationId: string; messageId: string };

/**
 * Keeps a copy of a photo, PDF or voice message the customer sent on WhatsApp in the same private
 * storage (R2) as the files of the site chat, for the same 7 days. It then shows on the lead card
 * with the chat files, and the same daily cleanup removes it when it expires.
 */
export async function archiveWhatsAppMedia(input: WhatsAppMediaToArchive) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) return { archived: false, reason: 'storage_off' };

  const already = await prisma.chatAttachment.findFirst({
    where: { tenantId: input.tenantId, conversationId: input.conversationId, clientMessageId: input.messageId },
    select: { id: true },
  });
  if (already) return { archived: false, reason: 'already' };

  const [message, connection] = await Promise.all([
    prisma.message.findFirst({
      where: { id: input.messageId, tenantId: input.tenantId, conversationId: input.conversationId, direction: 'inbound' },
      select: { type: true, metadata: true, createdAt: true },
    }),
    prisma.tenantWhatsAppConnection.findFirst({
      where: { id: input.connectionId, tenantId: input.tenantId },
      select: { accessTokenEncrypted: true },
    }),
  ]);
  const metadata = message?.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown> : {};
  const mediaId = typeof metadata.mediaId === 'string' ? metadata.mediaId : null;
  if (!message || !mediaId || !LABELS[message.type]) return { archived: false, reason: 'no_media' };

  const accessToken = connectionAccessToken(connection?.accessTokenEncrypted)
    || (await getPlatformWhatsAppRuntimeCredentials())?.systemUserAccessToken;
  if (!accessToken) return { archived: false, reason: 'no_token' };

  const media = await downloadWhatsAppMedia({ mediaId, accessToken });
  if (media.bytes.byteLength > MAX_ARCHIVE_BYTES) return { archived: false, reason: 'too_large' };
  // Only the types the chat already serves; anything else stays only on WhatsApp.
  const mimeType = sniffAttachmentMimeType(media.bytes);
  if (!mimeType) return { archived: false, reason: 'type_not_kept' };

  const id = randomUUID();
  const objectKey = `tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, '')}/whatsapp/${id}`;
  const day = message.createdAt.toISOString().slice(0, 10);
  const original = typeof metadata.mediaFileName === 'string' ? metadata.mediaFileName.slice(0, 120) : '';
  const name = original || `${LABELS[message.type]}-whatsapp-${day}.${EXTENSIONS[mimeType] || 'bin'}`;
  const now = new Date();

  await prisma.chatAttachment.create({
    data: {
      id,
      tenantId: input.tenantId,
      // Not a site chat session: a reference of the WhatsApp conversation, never the phone itself.
      sessionRef: `whatsapp:${createHash('sha256').update(input.conversationId).digest('hex').slice(0, 32)}`,
      conversationId: input.conversationId,
      clientMessageId: input.messageId,
      objectKey,
      name,
      mimeType,
      sizeBytes: media.bytes.byteLength,
      status: 'pending',
      expiresAt: new Date(now.getTime() + FLIP_AI_ATTACHMENT_RETENTION_DAYS * 86_400_000),
    },
  });

  const uploadUrl = createAttachmentUploadUrl(storage.config, {
    key: objectKey, contentType: mimeType, contentLength: media.bytes.byteLength, now,
  });
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'Content-Length': String(media.bytes.byteLength) },
    body: Buffer.from(media.bytes),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!uploaded?.ok) {
    // The pending row expires and is cleaned like any unfinished upload of the chat.
    return { archived: false, reason: 'upload_failed' };
  }
  await prisma.chatAttachment.update({ where: { id }, data: { status: 'ready' } });
  return { archived: true, attachmentId: id };
}

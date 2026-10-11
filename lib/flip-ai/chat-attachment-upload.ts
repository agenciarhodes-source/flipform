import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  createAttachmentUploadUrl,
  deleteAttachmentObject,
  readAttachmentObject,
  resolveAttachmentStorage,
} from '@/lib/storage/attachment-storage';
import {
  FLIP_AI_ATTACHMENT_MAX_BYTES,
  FLIP_AI_ATTACHMENT_MIME_TYPES,
  cleanAttachmentName,
  validateChatAttachment,
  type FlipAiAttachmentMimeType,
  type FlipAiChatAttachment,
} from './chat-attachment';

/**
 * Upload of a chat attachment in two steps: the server issues a signed link for one file,
 * the browser sends the file straight to private storage, and the file is only accepted
 * after the server has read it back and checked its real type and size.
 */

export const FLIP_AI_ATTACHMENT_RETENTION_DAYS = 7;
/** Links a single chat session may request per hour. */
export const FLIP_AI_ATTACHMENT_UPLOADS_PER_HOUR = 20;

const RETENTION_MS = FLIP_AI_ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ChatAttachmentUploadError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ChatAttachmentUploadError';
  }
}

/** The session is referenced by a hash; the cookie value itself is never stored. */
export function attachmentSessionRef(sessionToken: string) {
  return createHash('sha256').update(sessionToken, 'utf8').digest('hex');
}

function isSchemaPending(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2021' || error.code === 'P2022');
}

function unavailable() {
  return new ChatAttachmentUploadError(
    'CHAT_ATTACHMENTS_UNAVAILABLE', 503, 'O envio de arquivos não está disponível no momento.',
  );
}

/** Whether the chat should offer the attach button at all. */
export function chatAttachmentsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return resolveAttachmentStorage(env).ready;
}

export async function issueChatAttachmentUpload(input: {
  tenantId: string;
  sessionToken: string;
  name: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
  now?: Date;
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw unavailable();

  const mimeType = FLIP_AI_ATTACHMENT_MIME_TYPES.find((type) => type === input.mimeType);
  const sizeBytes = typeof input.sizeBytes === 'number' ? Math.trunc(input.sizeBytes) : Number.NaN;
  if (!mimeType) {
    throw new ChatAttachmentUploadError(
      'CHAT_ATTACHMENT_TYPE', 400, 'Envie uma foto (JPG, PNG ou WEBP) ou um documento em PDF.',
    );
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > FLIP_AI_ATTACHMENT_MAX_BYTES) {
    throw new ChatAttachmentUploadError(
      'CHAT_ATTACHMENT_SIZE', 400, 'O arquivo é maior que 5 MB. Envie um arquivo menor ou uma foto.',
    );
  }

  const now = input.now || new Date();
  const sessionRef = attachmentSessionRef(input.sessionToken);
  const id = randomUUID();
  // The key is built by the server alone; nothing typed by the visitor is part of it.
  const objectKey = `tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, '')}/chat/${id}`;
  try {
    const recent = await prisma.chatAttachment.count({
      where: { tenantId: input.tenantId, sessionRef, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (recent >= FLIP_AI_ATTACHMENT_UPLOADS_PER_HOUR) {
      throw new ChatAttachmentUploadError(
        'CHAT_ATTACHMENT_RATE_LIMIT', 429, 'Muitos arquivos enviados em pouco tempo. Tente novamente mais tarde.',
      );
    }
    await prisma.chatAttachment.create({
      data: {
        id,
        tenantId: input.tenantId,
        sessionRef,
        objectKey,
        name: cleanAttachmentName(typeof input.name === 'string' ? input.name : ''),
        mimeType,
        sizeBytes,
        status: 'pending',
        expiresAt: new Date(now.getTime() + RETENTION_MS),
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof ChatAttachmentUploadError) throw error;
    if (isSchemaPending(error)) throw unavailable();
    throw error;
  }

  return {
    attachmentId: id,
    uploadUrl: createAttachmentUploadUrl(storage.config, { key: objectKey, contentType: mimeType, contentLength: sizeBytes, now }),
    // The browser must send exactly this header, or the storage refuses the upload.
    headers: { 'Content-Type': mimeType },
  };
}

/**
 * Reads back the file the browser uploaded and accepts it only when the bytes are what was
 * declared. Anything else is removed from storage at once.
 */
export async function claimUploadedChatAttachment(input: {
  tenantId: string;
  sessionToken: string;
  attachmentId: unknown;
  now?: Date;
}): Promise<{ id: string; attachment: FlipAiChatAttachment }> {
  const invalid = new ChatAttachmentUploadError(
    'CHAT_ATTACHMENT_INVALID', 400, 'Não foi possível usar o arquivo enviado. Envie novamente.',
  );
  if (typeof input.attachmentId !== 'string' || !UUID.test(input.attachmentId)) throw invalid;
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw unavailable();

  const now = input.now || new Date();
  const row = await prisma.chatAttachment.findFirst({
    where: {
      id: input.attachmentId,
      tenantId: input.tenantId,
      sessionRef: attachmentSessionRef(input.sessionToken),
      status: { in: ['pending', 'ready'] },
      expiresAt: { gt: now },
    },
    select: { id: true, objectKey: true, name: true, mimeType: true, sizeBytes: true },
  }).catch((error: unknown) => {
    if (isSchemaPending(error)) throw unavailable();
    throw error;
  });
  if (!row) throw invalid;

  const reject = async () => {
    await deleteAttachmentObject(storage.config, { key: row.objectKey }).catch(() => undefined);
    await prisma.chatAttachment.updateMany({
      where: { id: row.id, tenantId: input.tenantId },
      data: { status: 'deleted', deletedAt: now },
    }).catch(() => undefined);
    return invalid;
  };

  const bytes = await readAttachmentObject(storage.config, { key: row.objectKey, maxBytes: FLIP_AI_ATTACHMENT_MAX_BYTES });
  if (!bytes) throw await reject();
  const checked = validateChatAttachment({ name: row.name, bytes });
  if (!checked.ok || checked.attachment.mimeType !== (row.mimeType as FlipAiAttachmentMimeType)
    || checked.attachment.sizeBytes !== row.sizeBytes) {
    throw await reject();
  }
  return { id: row.id, attachment: checked.attachment };
}

/** Links the accepted file to the conversation message it came with. */
export async function attachUploadToTurn(input: {
  tenantId: string;
  attachmentId: string;
  conversationId: string;
  clientMessageId: string;
}) {
  await prisma.chatAttachment.updateMany({
    where: { id: input.attachmentId, tenantId: input.tenantId, status: { in: ['pending', 'ready'] } },
    data: { status: 'ready', conversationId: input.conversationId, clientMessageId: input.clientMessageId },
  }).catch(() => undefined);
}

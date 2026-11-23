import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  createAttachmentUploadUrl,
  deleteAttachmentObject,
  readAttachmentObject,
  resolveAttachmentStorage,
} from '@/lib/storage/attachment-storage';
import { enqueueAndDispatchWhatsAppFileMessage } from '@/lib/meta/whatsapp-outbound';
import { WHATSAPP_MEDIA_RETENTION_DAYS } from '@/lib/whatsapp-ai/media-archive';
import { checkOutboundFile, fileMatchesType, OUTBOUND_FILE_TYPES, outboundFileLabel } from './outbound-file-rules';

/** An upload link not used within this time is dropped like any unfinished chat upload. */
const PENDING_MS = 60 * 60_000;

export class OutboundFileError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'OutboundFileError';
  }
}

/** Uploads of one person in the Inbox: a reference to them, never the id itself. */
function sessionRefOf(userId: string) {
  return `inbox:${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`;
}

/**
 * Step 1: checks the file the browser declared and returns a link that accepts exactly that file
 * (type and size) in the private storage. The browser sends it straight there, so large videos
 * never pass through the server request.
 */
export async function issueOutboundFileUpload(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
  name: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new OutboundFileError(503, 'O envio de arquivos não está disponível agora.');
  const check = checkOutboundFile(input);
  if (!check.ok) throw new OutboundFileError(400, check.error);

  const now = new Date();
  const id = randomUUID();
  const objectKey = `tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, '')}/inbox/${id}`;
  await prisma.chatAttachment.create({
    data: {
      id,
      tenantId: input.tenantId,
      sessionRef: sessionRefOf(input.userId),
      conversationId: input.conversationId,
      objectKey,
      name: check.name,
      mimeType: check.mimeType,
      sizeBytes: check.sizeBytes,
      status: 'pending',
      expiresAt: new Date(now.getTime() + PENDING_MS),
    },
    select: { id: true },
  });
  return {
    fileId: id,
    uploadUrl: createAttachmentUploadUrl(storage.config, { key: objectKey, contentType: check.mimeType, contentLength: check.sizeBytes, now }),
    // The browser must send exactly this header, or the storage refuses the upload.
    headers: { 'Content-Type': check.mimeType },
  };
}

/**
 * Step 2: reads back the uploaded file, accepts it only when it is what was declared, sends it to
 * the customer on WhatsApp and keeps the copy (5 years, as the files the customer sends).
 */
export async function sendOutboundFile(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
  fileId: string;
  idempotencyKey: string;
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new OutboundFileError(503, 'O envio de arquivos não está disponível agora.');
  const row = await prisma.chatAttachment.findFirst({
    where: {
      id: input.fileId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      sessionRef: sessionRefOf(input.userId),
      status: { in: ['pending', 'ready'] },
    },
    select: { id: true, objectKey: true, name: true, mimeType: true, sizeBytes: true, status: true, clientMessageId: true },
  });
  if (!row) throw new OutboundFileError(404, 'Arquivo não encontrado. Envie de novo.');
  const type = OUTBOUND_FILE_TYPES[row.mimeType];
  if (!type) throw new OutboundFileError(400, 'Tipo de arquivo não aceito.');

  const bytes = await readAttachmentObject(storage.config, { key: row.objectKey, maxBytes: type.maxBytes }).catch(() => null);
  if (!bytes || bytes.byteLength !== row.sizeBytes || !fileMatchesType(bytes, row.mimeType)) {
    // Not what was declared: removed at once, nothing is sent.
    await deleteAttachmentObject(storage.config, { key: row.objectKey }).catch(() => undefined);
    await prisma.chatAttachment.update({ where: { id: row.id }, data: { status: 'deleted', deletedAt: new Date() } }).catch(() => undefined);
    throw new OutboundFileError(400, 'O arquivo não chegou inteiro ou não é do tipo informado. Envie de novo.');
  }

  const result = await enqueueAndDispatchWhatsAppFileMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    requestedByUserId: input.userId,
    idempotencyKey: input.idempotencyKey,
    text: outboundFileLabel(type.kind, row.name),
    file: { bytes, mimeType: row.mimeType, fileName: row.name, kind: type.kind },
  });
  if (result.status !== 'failed' && result.messageId) {
    // The copy now belongs to the sent message: the Inbox opens it from the storage.
    await prisma.chatAttachment.update({
      where: { id: row.id },
      data: {
        status: 'ready',
        clientMessageId: result.messageId,
        expiresAt: new Date(Date.now() + WHATSAPP_MEDIA_RETENTION_DAYS * 86_400_000),
      },
    }).catch(() => undefined);
  }
  return result;
}

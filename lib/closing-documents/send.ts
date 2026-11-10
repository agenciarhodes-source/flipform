import 'server-only';

import { prisma } from '@/lib/prisma';
import { enqueueAndDispatchWhatsAppDocumentMessage, enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { closingDocuments, readClosingTemplate } from './store';
import {
  CLOSING_RESEND_GAP_MS,
  closingInstruction,
  signingInstructions,
  templatesForCase,
  type SigningSituation,
} from './send-rules';

const SENT_ACTION = 'closing_documents.sent';

async function caseOf(tenantId: string, conversationId: string) {
  const row = await prisma.conversationDocumentCase.findUnique({ where: { conversationId }, select: { checklistId: true, tenantId: true } }).catch(() => null);
  return row && row.tenantId === tenantId ? row.checklistId : null;
}

async function lastSent(tenantId: string, conversationId: string) {
  const row = await prisma.auditLog.findFirst({
    where: { tenantId, entityType: 'conversation', entityId: conversationId, action: SENT_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  }).catch(() => null);
  return row?.createdAt || null;
}

/** What the AI must know about the closing documents in this conversation, or null when off. */
export async function closingDocumentsContext(tenantId: string, conversationId: string) {
  const settings = await closingDocuments(tenantId).catch(() => null);
  if (!settings?.ready || !settings.enabled || !settings.storageReady || !settings.sendWhen.trim()) return null;
  const templates = templatesForCase(settings.templates, await caseOf(tenantId, conversationId));
  if (!templates.length) return null;
  const sentAt = await lastSent(tenantId, conversationId);
  return {
    templates,
    instruction: closingInstruction({ sendWhen: settings.sendWhen, fileNames: templates.map((template) => template.name), sentAt }),
    sentAt,
  };
}

/**
 * Sends the files of this conversation's case as they are, then how to fill and sign them.
 * A second send only after an hour, so a repeated marker never floods the customer.
 */
export async function sendClosingDocuments(input: {
  tenantId: string;
  conversationId: string;
  agent: { id: string; name: string };
  situation: SigningSituation;
  requestKey: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const context = await closingDocumentsContext(input.tenantId, input.conversationId);
  if (!context) return { sent: 0, reason: 'off' as const };
  if (context.sentAt && now.getTime() - context.sentAt.getTime() < CLOSING_RESEND_GAP_MS) return { sent: 0, reason: 'recent' as const };

  let sent = 0;
  for (const template of context.templates) {
    const file = await readClosingTemplate(input.tenantId, template.id);
    if (!file) continue;
    const result = await enqueueAndDispatchWhatsAppDocumentMessage({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      idempotencyKey: `closing-${input.requestKey}-${template.id}`,
      aiSender: { agentId: input.agent.id, agentName: input.agent.name },
      file: { bytes: file.bytes, mimeType: file.mime, fileName: `${file.name}.${file.kind}` },
    }).catch(() => null);
    if (result && result.status !== 'failed') sent += 1;
  }
  if (!sent) return { sent: 0, reason: 'failed' as const };
  await enqueueAndDispatchWhatsAppTextMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    requestedByUserId: '',
    text: signingInstructions(input.situation, sent),
    idempotencyKey: `closing-${input.requestKey}-how`,
    aiSender: { agentId: input.agent.id, agentName: input.agent.name },
  }).catch(() => null);
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: input.conversationId,
      action: SENT_ACTION, metadata: { situation: input.situation, files: context.templates.map((template) => template.name), sent },
    },
  }).catch(() => undefined);
  return { sent, reason: 'sent' as const };
}

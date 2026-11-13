import 'server-only';

import { prisma } from '@/lib/prisma';
import { pickConversationNumber } from './whatsapp-number-rules';

const CONNECTION_FIELDS = {
  id: true,
  tenantId: true,
  wabaId: true,
  phoneNumberId: true,
  status: true,
  accessTokenEncrypted: true,
} as const;

export class WhatsAppNumberError extends Error {
  constructor(readonly code: 'NOT_CONNECTED' | 'NUMBER_DISCONNECTED', message: string) {
    super(message);
    this.name = 'WhatsAppNumberError';
  }
}

/** The company's connected numbers, newest first. */
export async function connectedWhatsAppNumbers(tenantId: string) {
  return prisma.tenantWhatsAppConnection.findMany({
    where: { tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: CONNECTION_FIELDS,
  });
}

/**
 * The number that answers a conversation: the one it came through; with a single connected
 * number in the company, that one (as before). Never another number of a multi-number company.
 */
export async function whatsappNumberForConversation(tenantId: string, conversationId: string | null) {
  const [conversation, connected] = await Promise.all([
    conversationId
      ? prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { whatsappConnectionId: true } })
      : Promise.resolve(null),
    connectedWhatsAppNumbers(tenantId),
  ]);
  const choice = pickConversationNumber({ conversationNumberId: conversation?.whatsappConnectionId ?? null, connected });
  if (choice.kind === 'not_connected') throw new WhatsAppNumberError('NOT_CONNECTED', 'WhatsApp is not connected for tenant');
  if (choice.kind === 'number_disconnected') {
    throw new WhatsAppNumberError('NUMBER_DISCONNECTED', 'O número de WhatsApp desta conversa está desconectado. Reconecte-o em Integrações.');
  }
  return choice.connection;
}

/** The number a received message arrived on (from its metadata), else the conversation's number. */
export async function whatsappNumberForMessage(tenantId: string, input: { phoneNumberId?: string | null; conversationId?: string | null }) {
  if (input.phoneNumberId) {
    const byPhone = await prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId, phoneNumberId: input.phoneNumberId, status: 'connected' },
      select: CONNECTION_FIELDS,
    });
    if (byPhone) return byPhone;
  }
  return whatsappNumberForConversation(tenantId, input.conversationId ?? null).catch(() => null);
}

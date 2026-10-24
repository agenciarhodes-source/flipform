import 'server-only';

import { prisma } from '@/lib/prisma';
import { registrationFirstName } from '@/lib/whatsapp-ai/registration-rules';

function clean(value: string) {
  // Meta refuses parameters with line breaks, tabs or long runs of spaces.
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 200);
}

/**
 * The values of {{1}} name of the lead, {{2}} date the lead arrived and {{3}} company name, for one
 * conversation of the company. Null when the conversation is not the company's.
 */
export async function resolveWhatsAppTemplateValues(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: {
      startedAt: true,
      lead: { select: { name: true, createdAt: true } },
      externalContactIdentity: { select: { displayName: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!conversation) return null;
  // "Olá, Katerine!" instead of the full name in capitals: the first name, written normally.
  const fullName = clean(conversation.lead?.name || conversation.externalContactIdentity.displayName || '');
  const name = registrationFirstName(fullName) || fullName || 'cliente';
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(conversation.lead?.createdAt || conversation.startedAt);
  return [name, date, clean(conversation.tenant.name) || 'nossa empresa'];
}

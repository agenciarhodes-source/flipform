import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import {
  findOrLinkWhatsAppConversationForLead,
  startWhatsAppConversationForLead,
} from '@/lib/conversations/whatsapp-lead-linking';

export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const leadId = ctx.params.id?.trim();
  if (!leadId) {
    return NextResponse.json({ error: 'Lead inválido.' }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      tenantId: session.tenantId,
      ...(session.role === 'agent' ? { assignedTo: session.userId } : {}),
    },
    select: { id: true, phone: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  }
  if (!lead.phone?.trim()) {
    return NextResponse.json({ error: 'Este lead não possui telefone para localizar a conversa do WhatsApp.' }, { status: 422 });
  }

  const resolved = await findOrLinkWhatsAppConversationForLead({
    tenantId: session.tenantId,
    leadId: lead.id,
  });

  if (!resolved.conversationId) {
    const message = resolved.reason === 'ambiguous_conversation'
      ? 'Há mais de uma conversa possível para este telefone. Vincule a conversa correta pela Inbox antes de continuar.'
      : 'Ainda não há conversa do WhatsApp registrada para este lead.';
    return NextResponse.json({ error: message, reason: resolved.reason }, { status: 404 });
  }

  const accessible = await findAccessibleInboxConversation(session, resolved.conversationId);
  if (!accessible) {
    return NextResponse.json({ error: 'Você não possui acesso a esta conversa.' }, { status: 403 });
  }

  return NextResponse.json({
    conversationId: accessible.id,
    linkedLeadId: accessible.lead?.id || lead.id,
  });
});

const START_ERRORS: Record<string, { status: number; error: string }> = {
  not_connected: { status: 409, error: 'Conecte o WhatsApp desta empresa em Integrações para falar com o lead por aqui.' },
  invalid_phone: { status: 422, error: 'O telefone deste lead não é um número de WhatsApp válido.' },
  missing_phone: { status: 422, error: 'Este lead não possui telefone para iniciar a conversa do WhatsApp.' },
  ambiguous_conversation: { status: 409, error: 'Há mais de uma conversa possível para este telefone. Vincule a conversa correta pela Inbox antes de continuar.' },
};

// Opens the conversation for a lead that never wrote, so the first contact can be made from the Inbox.
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const leadId = ctx.params.id?.trim();
  if (!leadId) return NextResponse.json({ error: 'Lead inválido.' }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      tenantId: session.tenantId,
      ...(session.role === 'agent' ? { assignedTo: session.userId } : {}),
    },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  const started = await startWhatsAppConversationForLead({
    tenantId: session.tenantId,
    leadId: lead.id,
    userId: session.userId,
  });
  if (!started.conversationId) {
    const known = START_ERRORS[started.reason];
    return NextResponse.json(
      { error: known?.error || 'Não foi possível iniciar a conversa do WhatsApp com este lead.', reason: started.reason },
      { status: known?.status || 409 },
    );
  }

  const accessible = await findAccessibleInboxConversation(session, started.conversationId);
  if (!accessible) return NextResponse.json({ error: 'Você não possui acesso a esta conversa.' }, { status: 403 });
  return NextResponse.json({ conversationId: accessible.id, linkedLeadId: lead.id, created: started.created });
});

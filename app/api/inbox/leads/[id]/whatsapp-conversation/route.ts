import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { findOrLinkWhatsAppConversationForLead } from '@/lib/conversations/whatsapp-lead-linking';

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

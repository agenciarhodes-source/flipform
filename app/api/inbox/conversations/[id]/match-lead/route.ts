import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { linkWhatsAppConversationToMatchingLead } from '@/lib/conversations/whatsapp-lead-linking';

/**
 * Finds the lead of a conversation that is not linked yet, by the phone number, with or without
 * the ninth digit. Links it only when exactly one lead of the company has that number.
 */
export const POST = withPermission('INBOX_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });

  const result = await linkWhatsAppConversationToMatchingLead({ tenantId: session.tenantId, conversationId: conversation.id });
  const leadId = 'leadId' in result ? result.leadId : undefined;
  if (!result.linked || !leadId) {
    const error = result.reason === 'ambiguous_lead'
      ? 'Há mais de um lead com este telefone. Vincule o certo em Ações.'
      : 'Nenhum lead com este telefone. Vincule um lead em Ações, se ele existir.';
    return NextResponse.json({ error, reason: result.reason }, { status: 404 });
  }

  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId: session.tenantId }, select: { id: true, pipelineId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (result.reason !== 'already_linked') {
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'INBOX_CONVERSATION_LEAD_LINKED',
      metadata: { leadId: lead.id, source: 'phone_match' },
    });
  }
  return NextResponse.json({ leadId: lead.id, pipelineId: lead.pipelineId });
});

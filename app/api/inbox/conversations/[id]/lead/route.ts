import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { InboxActionError, linkInboxConversationToLead } from '@/lib/inbox/actions';

const bodySchema = z.object({
  leadId: z.string().trim().min(1).max(128),
}).strict();

export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Lead inválido.' }, { status: 400 });

  try {
    const result = await linkInboxConversationToLead({
      session,
      conversationId: ctx.params.id,
      leadId: parsed.data.leadId,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'conversation',
      entityId: result.conversationId,
      action: 'INBOX_CONVERSATION_LEAD_LINKED',
      metadata: {
        leadId: result.lead.id,
        previousLeadId: result.previousLeadId,
        changed: result.changed,
      },
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof InboxActionError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'LEAD_NOT_FOUND') return NextResponse.json({ error: 'Lead não encontrado no seu escopo.' }, { status: 404 });
      if (error.code === 'ALREADY_LINKED') return NextResponse.json({ error: 'Esta conversa já está vinculada a outro lead.' }, { status: 409 });
    }
    console.error('Inbox lead link failed', {
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível vincular o lead.' }, { status: 500 });
  }
});

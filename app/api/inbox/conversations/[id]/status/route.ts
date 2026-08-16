import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { InboxActionError, setInboxConversationStatus } from '@/lib/inbox/actions';

const bodySchema = z.object({
  status: z.enum(['open', 'resolved']),
}).strict();

export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });

  try {
    const result = await setInboxConversationStatus({
      session,
      conversationId: ctx.params.id,
      status: parsed.data.status,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'conversation',
      entityId: result.conversationId,
      action: result.status === 'resolved' ? 'INBOX_CONVERSATION_RESOLVED' : 'INBOX_CONVERSATION_REOPENED',
      metadata: {
        previousStatus: result.previousStatus,
        status: result.status,
        changed: result.changed,
      },
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof InboxActionError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'INVALID_STATUS') return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    console.error('Inbox status update failed', {
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 500 });
  }
});

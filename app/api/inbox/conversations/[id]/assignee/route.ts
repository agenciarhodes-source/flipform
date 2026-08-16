import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { assignInboxConversation, InboxActionError } from '@/lib/inbox/actions';

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(128).nullable(),
}).strict();

export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Responsável inválido.' }, { status: 400 });

  try {
    const result = await assignInboxConversation({
      session,
      conversationId: ctx.params.id,
      userId: parsed.data.userId,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'conversation',
      entityId: result.conversationId,
      action: 'INBOX_CONVERSATION_ASSIGNED',
      metadata: {
        previousAssignedTo: result.previousAssignedTo,
        assignedTo: result.assignedTo,
      },
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof InboxActionError) {
      if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode atribuir conversas.' }, { status: 403 });
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'INVALID_ASSIGNEE') return NextResponse.json({ error: 'Responsável inválido para esta empresa.' }, { status: 400 });
    }
    console.error('Inbox assignment failed', {
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível atribuir a conversa.' }, { status: 500 });
  }
});

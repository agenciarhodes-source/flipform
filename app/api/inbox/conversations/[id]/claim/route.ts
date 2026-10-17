import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { claimInboxConversation } from '@/lib/inbox/ownership';
import { seesUnassignedConversations } from '@/lib/inbox/unassigned-viewers';

/** "Assumir": a conversation nobody has (and its lead, if free) becomes this user's. */
export const POST = withPermission('INBOX_MANAGE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  if (!(await seesUnassignedConversations(session))) {
    return NextResponse.json({ error: 'Você não está entre os atendentes que assumem conversas sem responsável.' }, { status: 403 });
  }
  const result = await claimInboxConversation({ tenantId: session.tenantId, userId: session.userId, conversationId: ctx.params.id });
  if (result === 'taken') {
    return NextResponse.json({ error: 'Esta conversa já está com outra pessoa. Peça ao gestor para transferir.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, result });
});

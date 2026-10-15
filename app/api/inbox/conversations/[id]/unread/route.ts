import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';

// Marks a conversation as unread again, so it comes back to the "Não lidas" list.
export const POST = withPermission('INBOX_MANAGE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  await prisma.conversation.updateMany({
    where: { id: conversation.id, tenantId: session.tenantId, unreadCount: 0 },
    data: { unreadCount: 1 },
  });

  return NextResponse.json({ ok: true });
});

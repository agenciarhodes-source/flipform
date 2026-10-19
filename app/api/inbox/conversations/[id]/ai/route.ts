import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { pauseConversationAi, resumeConversationAi } from '@/lib/whatsapp-ai/pause';

const bodySchema = z.object({ action: z.enum(['pause', 'resume']) }).strict();

/** "Pausar IA e assumir" / "Devolver para a IA", by whoever can work on the conversation. */
export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation || conversation.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  if (parsed.data.action === 'pause') {
    await pauseConversationAi({ tenantId: session.tenantId, conversationId: conversation.id, userId: session.userId, reason: 'manual' });
  } else {
    await resumeConversationAi({ tenantId: session.tenantId, conversationId: conversation.id, userId: session.userId });
  }
  return NextResponse.json({ ok: true });
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { pauseConversationAi, resumeConversationAi } from '@/lib/whatsapp-ai/pause';
import { pendingWhatsAppReply } from '@/lib/whatsapp-ai/reply';
import { scheduleAfterResponse } from '@/lib/vercel-wait-until';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({ action: z.enum(['pause', 'resume', 'answer']) }).strict();

/**
 * "Pausar IA e assumir" / "Devolver para a IA" / "Responder agora com a IA", by whoever can work on
 * the conversation. Handing back (or asking for an answer) makes the AI answer the customer's last
 * message right away when it is still unanswered.
 */
export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation || (conversation.channel !== 'whatsapp' && conversation.channel !== 'instagram')) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  if (parsed.data.action === 'pause') {
    await pauseConversationAi({ tenantId: session.tenantId, conversationId: conversation.id, userId: session.userId, reason: 'manual' });
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.action === 'resume') {
    await resumeConversationAi({ tenantId: session.tenantId, conversationId: conversation.id, userId: session.userId });
  }
  if (conversation.channel === 'instagram') return NextResponse.json({ ok: true });

  const pending = await pendingWhatsAppReply({ tenantId: session.tenantId, conversationId: conversation.id });
  if (pending.status === 'answering') {
    const work = pending.run()
      .then((outcome) => console.info('WhatsApp AI handback reply', { conversationId: conversation.id, ...outcome }))
      .catch((error) => console.error('WhatsApp AI handback reply failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
    if (!scheduleAfterResponse(work)) await work;
  }
  return NextResponse.json({ ok: true, reply: pending.status });
});

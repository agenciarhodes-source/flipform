import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { enqueueAndDispatchWhatsAppTextMessage, WhatsAppOutboundError } from '@/lib/meta/whatsapp-outbound';
import { correctionBlock, correctionSchema, correctionText } from '@/lib/inbox/correction-rules';

type EditRow = { id: string; previous_text: string; new_text: string; created_at: Date; editor: string | null };

async function loadMessage(tenantId: string, id: string) {
  return prisma.message.findFirst({
    where: { id, tenantId },
    select: { id: true, conversationId: true, direction: true, channel: true, type: true, status: true, text: true, sentByUserId: true, metadata: true },
  });
}

async function history(tenantId: string, messageId: string) {
  return prisma.$queryRaw<EditRow[]>`
    SELECT e.id, e.previous_text, e.new_text, e.created_at, u.name AS editor
    FROM message_edits e LEFT JOIN users u ON u.id = e.edited_by
    WHERE e.tenant_id = ${tenantId} AND e.message_id = ${messageId}
    ORDER BY e.created_at ASC`;
}

/** History of versions of one message (only the team sees it). */
export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const message = await loadMessage(session.tenantId, ctx.params.id);
  if (!message || !(await findAccessibleInboxConversation(session, message.conversationId))) {
    return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  }
  const rows = await history(session.tenantId, message.id).catch(() => []);
  return NextResponse.json({
    original: message.text,
    edits: rows.map((row) => ({ id: row.id, before: row.previous_text, after: row.new_text, at: row.created_at.toISOString(), editor: row.editor })),
  });
});

/** Corrects a message the team sent: a reply quoting it goes to the customer, the history keeps both versions. */
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const rl = await rateLimit({ key: `message-correction:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = correctionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Texto inválido.' }, { status: 400 });
  const message = await loadMessage(session.tenantId, ctx.params.id);
  const conversation = message ? await findAccessibleInboxConversation(session, message.conversationId) : null;
  if (!message || !conversation) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });

  const meta = (message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata : {}) as Record<string, unknown>;
  const providerMessageId = typeof meta.providerMessageId === 'string' ? meta.providerMessageId : null;
  const lastInbound = await prisma.conversation.findFirst({ where: { id: message.conversationId, tenantId: session.tenantId }, select: { lastInboundAt: true } });
  const blocked = correctionBlock({
    message: { ...message, providerMessageId },
    lastInboundAt: lastInbound?.lastInboundAt || null,
    requesterId: session.userId,
    requesterRole: session.role,
    now: new Date(),
  });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const rows = await history(session.tenantId, message.id).catch(() => null);
  if (!rows) return NextResponse.json({ error: 'A correção de mensagens ainda não foi instalada no banco.' }, { status: 409 });
  const current = rows.length ? rows[rows.length - 1]!.new_text : (message.text || '');
  const text = parsed.data.text;
  if (text === current.trim()) return NextResponse.json({ error: 'O texto é igual ao atual.' }, { status: 400 });

  try {
    const sent = await enqueueAndDispatchWhatsAppTextMessage({
      tenantId: session.tenantId,
      conversationId: message.conversationId,
      requestedByUserId: session.userId,
      text: correctionText(text),
      idempotencyKey: `correction:${message.id}:${createHash('sha256').update(text).digest('hex').slice(0, 24)}`,
      replyToProviderMessageId: providerMessageId!,
    });
    if (sent.status === 'failed') return NextResponse.json({ error: 'A Meta recusou o envio da correção.' }, { status: 502 });
    await prisma.$executeRaw`
      INSERT INTO message_edits (id, tenant_id, message_id, correction_message_id, previous_text, new_text, edited_by, created_at)
      VALUES (${randomUUID()}, ${session.tenantId}, ${message.id}, ${sent.messageId}, ${current}, ${text}, ${session.userId}, NOW())`;
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId, userId: session.userId, entityType: 'message', entityId: message.id,
        action: 'inbox.message_corrected', metadata: { conversationId: message.conversationId, correctionMessageId: sent.messageId },
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: sent.status });
  } catch (error) {
    if (error instanceof WhatsAppOutboundError && error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Você não pode enviar mensagens nesta conversa.' }, { status: 403 });
    }
    if (error instanceof WhatsAppOutboundError && error.code === 'IDEMPOTENCY_CONFLICT') {
      return NextResponse.json({ error: 'Esta correção já foi enviada.' }, { status: 409 });
    }
    throw error;
  }
});

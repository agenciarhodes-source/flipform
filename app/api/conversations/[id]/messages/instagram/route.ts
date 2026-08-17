import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { enqueueAndDispatchInstagramTextMessage, InstagramOutboundError } from '@/lib/meta/instagram-outbound';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4096),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

export const POST = withPermission('INBOX_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({
    key: `instagram-conversation-send:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensagem ou chave de idempotência inválida.' }, { status: 400 });
  }

  try {
    const result = await enqueueAndDispatchInstagramTextMessage({
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      requestedByUserId: session.userId,
      text: parsed.data.text,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (result.status === 'failed') {
      return NextResponse.json({
        error: 'A Meta recusou o envio ou a conexão do Instagram não está disponível.',
        result,
      }, { status: 502 });
    }
    if (result.status === 'delivery_unknown' || result.status === 'in_progress') {
      return NextResponse.json({
        result,
        warning: 'O envio não será repetido automaticamente para evitar mensagem duplicada.',
      }, { status: 202 });
    }
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof InstagramOutboundError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode enviar mensagens nesta conversa.' }, { status: 403 });
      if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'Instagram não conectado ou precisa ser reconectado para esta empresa.' }, { status: 409 });
      if (error.code === 'RECIPIENT_NOT_ELIGIBLE') {
        return NextResponse.json({ error: 'O Instagram só permite responder depois que a pessoa inicia a conversa.' }, { status: 422 });
      }
      if (error.code === 'ACCOUNT_MISMATCH') {
        return NextResponse.json({ error: 'Esta conversa pertence a outra conta profissional do Instagram. Aguarde uma nova mensagem na conta atualmente conectada.' }, { status: 409 });
      }
      if (error.code === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'A chave de idempotência já foi usada com outro conteúdo.' }, { status: 409 });
      if (error.code === 'INVALID_REQUEST') {
        return NextResponse.json({ error: 'Não foi possível preparar esta mensagem para envio.' }, { status: 400 });
      }
    }

    console.error('Instagram outbound endpoint failed', {
      tenantId: session.tenantId,
      userId: session.userId,
      conversationId: ctx.params.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível enviar a mensagem agora.' }, { status: 500 });
  }
});

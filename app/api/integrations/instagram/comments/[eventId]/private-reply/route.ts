import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  enqueueAndDispatchInstagramPrivateReply,
  InstagramPrivateReplyError,
} from '@/lib/meta/instagram-private-reply';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4096),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

export const POST = withPermission(
  'INTEGRATIONS_EDIT',
  async (req: NextRequest, session, ctx: { params: { eventId: string } }) => {
    const rl = rateLimit({
      key: `instagram-private-reply:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Mensagem ou chave de idempotência inválida.' }, { status: 400 });
    }

    try {
      const result = await enqueueAndDispatchInstagramPrivateReply({
        tenantId: session.tenantId,
        sourceCommentEventId: ctx.params.eventId,
        requestedByUserId: session.userId,
        text: parsed.data.text,
        idempotencyKey: parsed.data.idempotencyKey,
      });

      if (result.status === 'failed') {
        return NextResponse.json({
          error: 'A Meta recusou o private reply.',
          result,
        }, { status: 502 });
      }
      if (result.status === 'delivery_unknown' || result.status === 'in_progress') {
        return NextResponse.json({
          result,
          warning: 'O envio não será repetido automaticamente para evitar uma segunda resposta privada ao mesmo comentário.',
        }, { status: 202 });
      }
      return NextResponse.json({ result }, { status: 200 });
    } catch (error) {
      if (error instanceof InstagramPrivateReplyError) {
        if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Comentário do Instagram não encontrado.' }, { status: 404 });
        if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode enviar private replies.' }, { status: 403 });
        if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'Reconecte o Instagram com permissão de comentários antes de enviar.' }, { status: 409 });
        if (error.code === 'COMMENT_NOT_ELIGIBLE') return NextResponse.json({ error: 'Este comentário está fora da janela permitida para private reply.' }, { status: 422 });
        if (error.code === 'LIVE_NOT_SUPPORTED') return NextResponse.json({ error: 'Private reply em Live ainda não está habilitado no FlipForm.' }, { status: 422 });
        if (error.code === 'ACCOUNT_MISMATCH') return NextResponse.json({ error: 'Este comentário pertence a outra conta profissional do Instagram.' }, { status: 409 });
        if (error.code === 'ALREADY_REPLIED') return NextResponse.json({ error: 'Já existe uma tentativa de private reply para este comentário.' }, { status: 409 });
        if (error.code === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'A chave de idempotência já foi usada com outro conteúdo.' }, { status: 409 });
        if (error.code === 'INVALID_REQUEST') return NextResponse.json({ error: 'Não foi possível preparar este private reply.' }, { status: 400 });
      }

      console.error('Instagram private reply endpoint failed', {
        tenantId: session.tenantId,
        userId: session.userId,
        sourceCommentEventId: ctx.params.eventId,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return NextResponse.json({ error: 'Não foi possível enviar o private reply agora.' }, { status: 500 });
    }
  },
);

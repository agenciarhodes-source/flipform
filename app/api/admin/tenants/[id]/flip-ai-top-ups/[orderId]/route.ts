import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import {
  cancelFlipAiTopUpOrder,
  creditFlipAiTopUpOrder,
  markFlipAiTopUpPaid,
} from '@/lib/flip-ai/top-ups';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_paid'),
    paymentProvider: z.string().trim().min(2).max(60),
    providerPaymentId: z.string().trim().min(3).max(190),
    paymentMethod: z.string().trim().min(2).max(60).nullable().optional(),
  }).strict(),
  z.object({ action: z.literal('credit') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);

export const POST = withPlatformAdmin(async (
  req,
  session,
  ctx: { params: { id: string; orderId: string } },
) => {
  const rl = rateLimit({
    key: `admin:flip-ai-top-up:action:${session.userId}`,
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.errors[0]?.message || 'Ação inválida.',
    }, { status: 400 });
  }

  try {
    const base = {
      tenantId: ctx.params.id,
      orderId: ctx.params.orderId,
      actorUserId: session.userId,
    };

    if (parsed.data.action === 'mark_paid') {
      const result = await markFlipAiTopUpPaid({
        ...base,
        paymentProvider: parsed.data.paymentProvider,
        providerPaymentId: parsed.data.providerPaymentId,
        paymentMethod: parsed.data.paymentMethod,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (parsed.data.action === 'credit') {
      const result = await creditFlipAiTopUpOrder(base);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await cancelFlipAiTopUpOrder(base);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível atualizar a recarga comercial.' }, { status: 500 });
  }
});

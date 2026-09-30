import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import {
  createFlipAiTopUpOrder,
  listFlipAiTopUpOrdersForTenant,
} from '@/lib/flip-ai/top-ups';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const createSchema = z.object({
  requestKey: z.string().trim().min(4).max(120)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Use apenas letras, números, ponto, hífen, dois-pontos ou sublinhado.'),
  amountCents: z.number().int().positive().max(100_000_000),
  credits: z.number().int().positive().max(2_000_000_000),
  estimatedOpenAiCostCents: z.number().int().nonnegative().max(100_000_000).default(0),
}).strict();

export const GET = withPlatformAdmin(async (_req, _session, ctx: { params: { id: string } }) => {
  try {
    const result = await listFlipAiTopUpOrdersForTenant(ctx.params.id, 100);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível carregar as recargas comerciais.' }, { status: 500 });
  }
});

export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({
    key: `admin:flip-ai-top-up:create:${session.userId}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.errors[0]?.message || 'Dados inválidos.',
    }, { status: 400 });
  }

  try {
    const result = await createFlipAiTopUpOrder({
      tenantId: ctx.params.id,
      requestKey: parsed.data.requestKey,
      amountCents: parsed.data.amountCents,
      credits: parsed.data.credits,
      estimatedOpenAiCostCents: parsed.data.estimatedOpenAiCostCents,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível criar a recarga comercial.' }, { status: 500 });
  }
});

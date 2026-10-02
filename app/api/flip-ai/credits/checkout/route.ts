import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { FlipAiError } from '@/lib/flip-ai/access';
import { createFlipAiSelfServiceCheckout } from '@/lib/flip-ai/self-service-credits';
import { StripeCheckoutError } from '@/lib/stripe/top-up-checkout';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const schema = z.object({
  packageId: z.string().trim().min(2).max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Pacote inválido.'),
  requestKey: z.string().uuid(),
}).strict();

export const POST = withPermission('FLIP_AI_MANAGE', async (req, session) => {
  const rl = rateLimit({
    key: `flip-ai-credit-checkout:${session.tenantId}:${session.userId}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'Dados inválidos.' },
      { status: 400 },
    );
  }

  try {
    const result = await createFlipAiSelfServiceCheckout({
      session,
      packageId: parsed.data.packageId,
      requestKey: parsed.data.requestKey,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    if (error instanceof FlipAiError || error instanceof StripeCheckoutError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível iniciar a compra de créditos.' },
      { status: 500 },
    );
  }
});

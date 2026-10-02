import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import {
  createStripeCheckoutForTopUp,
  StripeCheckoutError,
} from '@/lib/stripe/top-up-checkout';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const POST = withPlatformAdmin(async (
  _req,
  session,
  ctx: { params: { id: string; orderId: string } },
) => {
  const rl = rateLimit({
    key: `admin:stripe-checkout:${session.userId}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const result = await createStripeCheckoutForTopUp({
      tenantId: ctx.params.id,
      orderId: ctx.params.orderId,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    if (error instanceof StripeCheckoutError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível criar o Checkout da Stripe.' },
      { status: 500 },
    );
  }
});

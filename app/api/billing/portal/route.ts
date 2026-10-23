import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { StripeFoundationConfigError } from '@/lib/stripe/config';
import { createBillingPortalUrl, StripeManageError } from '@/lib/stripe/subscription-manage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.flipform.com.br').replace(/\/+$/, '');
}

/** "Gerenciar pagamento e faturas": opens Stripe's own page for the owner of the company. */
export const POST = withPermission('BILLING_MANAGE', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `billing:portal:user:${session.userId}:ip:${getClientIp(req)}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  try {
    const url = await createBillingPortalUrl(session.tenantId, `${appBaseUrl()}/billing`);
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: session.tenantId, action: 'billing.portal_opened' });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof StripeManageError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof StripeFoundationConfigError) return NextResponse.json({ error: 'Pagamentos indisponíveis no momento.', code: error.code }, { status: 503 });
    console.error('[billing.portal]', { message: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível abrir a área de pagamento agora.', code: 'PORTAL_FAILED' }, { status: 502 });
  }
});

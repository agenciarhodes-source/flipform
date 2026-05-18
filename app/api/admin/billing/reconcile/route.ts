import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { withPlatformAdmin } from '@/lib/auth';
import { reconcileProviderSubscription, reconcileSubscription, reconcileTenantBilling } from '@/lib/billing-reconciliation';

export const POST = withPlatformAdmin(async (req, session) => {
  const rl = rateLimit({ key: `admin:billing-reconcile:user:${session.userId}`, limit: 60, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const body = await req.json().catch(() => ({} as any));
  const subscriptionId = body?.subscriptionId ? String(body.subscriptionId) : null;
  const tenantId = body?.tenantId ? String(body.tenantId) : null;
  const providerSubscriptionId = body?.providerSubscriptionId ? String(body.providerSubscriptionId) : null;

  const supplied = [subscriptionId, tenantId, providerSubscriptionId].filter(Boolean).length;
  if (supplied !== 1) {
    return NextResponse.json({ error: 'send exactly one of subscriptionId, tenantId, providerSubscriptionId' }, { status: 400 });
  }

  const result = subscriptionId
    ? await reconcileSubscription(subscriptionId)
    : tenantId
      ? await reconcileTenantBilling(tenantId)
      : await reconcileProviderSubscription(providerSubscriptionId!);

  return NextResponse.json(result, { status: result.success ? 200 : 422 });
});

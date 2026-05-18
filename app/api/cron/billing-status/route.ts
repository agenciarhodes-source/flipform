import { NextResponse } from 'next/server';
import { captureServerException } from '@/lib/observability';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { evaluateBillingAccess } from '@/lib/billing-access';

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return token === secret;
}

export async function POST(req: Request) {
  try {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `job:billing-status:ip:${ip}`, limit: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: { status: 'past_due', paymentRequired: true },
    select: { id: true, tenantId: true, status: true, gracePeriodEndsAt: true, tenant: { select: { status: true, name: true } } },
  });

  let suspended = 0;
  for (const sub of subscriptions) {
    const access = evaluateBillingAccess({
      tenantStatus: sub.tenant.status,
      subscriptionStatus: sub.status,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      now,
    });

    if (!access.shouldSuspend) continue;

    await prisma.subscription.updateMany({ where: { id: sub.id, status: 'past_due' }, data: { status: 'suspended' } });
    await prisma.tenant.updateMany({ where: { id: sub.tenantId, status: { not: 'canceled' } }, data: { status: 'suspended' } });
    console.info('[billing-status-cron] suspended tenant', { tenantId: sub.tenantId, tenantName: sub.tenant.name, subscriptionId: sub.id });
    suspended += 1;
  }

  return NextResponse.json({ ok: true, candidates: subscriptions.length, suspended });
  } catch (error) {
    captureServerException(error, { route: '/api/cron/billing-status', method: 'POST' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

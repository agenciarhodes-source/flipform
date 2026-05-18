import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reconcileSubscription } from '@/lib/billing-reconciliation';

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return token === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const suspects = await prisma.subscription.findMany({
    where: { status: { in: ['past_due', 'suspended'] }, paymentRequired: true, providerSubscriptionId: { not: null } },
    select: { id: true },
    take: 100,
    orderBy: { updatedAt: 'asc' },
  });

  let changed = 0;
  let failed = 0;
  for (const s of suspects) {
    const result = await reconcileSubscription(s.id);
    if (!result.success) failed += 1;
    if (result.changed) changed += 1;
  }

  return NextResponse.json({ ok: true, candidates: suspects.length, changed, failed });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const now = new Date();
  const overdue = await prisma.subscription.findMany({ where: { status: 'past_due', gracePeriodEndsAt: { lt: now }, paymentRequired: true } });
  for (const s of overdue) {
    await prisma.subscription.update({ where: { id: s.id }, data: { status: 'suspended' } });
    await prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'suspended' } });
  }
  return NextResponse.json({ ok: true, suspended: overdue.length });
}

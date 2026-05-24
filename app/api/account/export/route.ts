import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

export const GET = withAuth(async (_req: NextRequest, session) => {
  const rl = rateLimit({ key: `account:export:tenant:${session.tenantId}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  if (!['owner', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Você não tem permissão para executar esta ação.', code: 'FORBIDDEN' }, { status: 403 });

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'account', entityId: session.tenantId, action: 'account.export.requested' });

  const [tenant, users, forms, leads, pipelines, tasks, notes, subscriptions, payments, auditLogs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.tenantUser.findMany({ where: { tenantId: session.tenantId }, include: { user: { select: { id: true, name: true, email: true, globalRole: true, createdAt: true, updatedAt: true } } } }),
    prisma.form.findMany({ where: { tenantId: session.tenantId }, include: { fields: true } }),
    prisma.lead.findMany({ where: { tenantId: session.tenantId }, include: { answers: true } }),
    prisma.pipeline.findMany({ where: { tenantId: session.tenantId }, include: { stages: true } }),
    prisma.task.findMany({ where: { tenantId: session.tenantId } }),
    prisma.note.findMany({ where: { tenantId: session.tenantId } }),
    prisma.subscription.findMany({ where: { tenantId: session.tenantId }, select: { id: true, status: true, provider: true, currentPeriodStart: true, currentPeriodEnd: true, nextDueDate: true, createdAt: true, updatedAt: true, canceledAt: true, planId: true } }),
    prisma.payment.findMany({ where: { tenantId: session.tenantId }, select: { id: true, status: true, value: true, dueDate: true, paidAt: true, createdAt: true, updatedAt: true, provider: true, invoiceUrl: true, billingType: true, subscriptionId: true } }),
    prisma.auditLog.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' }, take: 2000 }),
  ]);

  const payload = { exportedAt: new Date().toISOString(), tenant, users, forms, leads, pipelines, tasks, notes, billing: { subscriptions, payments }, auditLogs };
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'account', entityId: session.tenantId, action: 'account.export.generated', metadata: { sizeHint: JSON.stringify(payload).length } });

  const filename = `flipform-export-${session.tenantSlug || session.tenantId}-${new Date().toISOString().slice(0,10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${filename}"` } });
});

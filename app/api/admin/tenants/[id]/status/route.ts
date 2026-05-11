import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const ALLOWED_STATUSES = ['active', 'trial', 'past_due', 'suspended', 'blocked', 'canceled'] as const;

const schema = z.object({
  status: z.enum(ALLOWED_STATUSES),
  reason: z.string().max(500).optional(),
});

const ACTION_MAP: Record<string, string> = {
  active: 'platform.tenant_activated',
  trial: 'platform.tenant_activated',
  suspended: 'platform.tenant_suspended',
  blocked: 'platform.tenant_blocked',
  canceled: 'platform.tenant_canceled',
  past_due: 'platform.tenant_marked_past_due',
};

export const PUT = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.params.id }, select: { id: true, status: true, name: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });

  const newStatus = parsed.data.status;
  if (newStatus === tenant.status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenant.id }, data: { status: newStatus as any } }),
    prisma.tenantStatusHistory.create({
      data: {
        tenantId: tenant.id,
        previousStatus: tenant.status,
        newStatus,
        reason: parsed.data.reason || null,
        changedBy: session.userId,
      },
    }),
  ]);

  await logPlatformAudit({
    tenantId: tenant.id, userId: session.userId,
    entityType: 'tenant', entityId: tenant.id,
    action: ACTION_MAP[newStatus] || 'platform.tenant_status_changed',
    metadata: { from: tenant.status, to: newStatus, reason: parsed.data.reason || null, name: tenant.name },
  });

  return NextResponse.json({ ok: true, status: newStatus });
});

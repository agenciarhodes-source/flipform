import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const schema = z.object({
  planId: z.string().uuid().nullable(),
  nextDueDate: z.string().datetime({ offset: true }).optional().nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
});

export const PUT = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.params.id }, select: { id: true, planId: true, nextDueDate: true, name: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });

  if (parsed.data.planId) {
    const p = await prisma.plan.findUnique({ where: { id: parsed.data.planId }, select: { id: true } });
    if (!p) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      planId: parsed.data.planId,
      nextDueDate: parsed.data.nextDueDate ? new Date(parsed.data.nextDueDate) : null,
      ...(parsed.data.internalNotes !== undefined ? { internalNotes: parsed.data.internalNotes } : {}),
    },
  });

  await logPlatformAudit({
    tenantId: tenant.id, userId: session.userId,
    entityType: 'tenant', entityId: tenant.id,
    action: parsed.data.planId !== tenant.planId ? 'platform.tenant_plan_changed' : 'platform.tenant_due_date_changed',
    metadata: { fromPlanId: tenant.planId, toPlanId: parsed.data.planId, nextDueDate: parsed.data.nextDueDate },
  });

  return NextResponse.json({ ok: true });
});

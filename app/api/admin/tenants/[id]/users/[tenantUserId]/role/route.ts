import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const roleSchema = z.object({
  role: z.enum(['owner', 'admin', 'manager', 'agent', 'viewer']),
});

export const PUT = withPlatformAdmin(async (req, session, ctx: { params: { id: string; tenantUserId: string } }) => {
  const parsed = roleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const target = await prisma.tenantUser.findFirst({
    where: { id: ctx.params.tenantUserId, tenantId: ctx.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Usuário da empresa não encontrado.' }, { status: 404 });

  const previousRole = String(target.role);
  if (previousRole === parsed.data.role) {
    return NextResponse.json({ ok: true, role: previousRole, unchanged: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenantUser.update({
      where: { id: target.id },
      data: { role: parsed.data.role },
    });

    const existingAllowed = await tx.allowedUser.findUnique({
      where: { tenantId_email: { tenantId: ctx.params.id, email: target.user.email } },
    });

    if (existingAllowed) {
      await tx.allowedUser.update({
        where: { id: existingAllowed.id },
        data: { role: parsed.data.role },
      });
    } else {
      const active = target.status === 'active';
      await tx.allowedUser.create({
        data: {
          tenantId: ctx.params.id,
          email: target.user.email,
          role: parsed.data.role,
          active,
          status: active ? 'active' : 'blocked',
          source: 'platform_tenant_role_change',
          invitedBy: session.userId,
          acceptedAt: active ? new Date() : null,
        },
      });
    }
  });

  await logPlatformAudit({
    tenantId: ctx.params.id,
    userId: session.userId,
    entityType: 'tenant_user',
    entityId: target.id,
    action: 'platform.tenant_user_role_changed',
    metadata: {
      targetUserId: target.userId,
      email: target.user.email,
      fromRole: previousRole,
      toRole: parsed.data.role,
    },
  });

  return NextResponse.json({
    ok: true,
    tenantUserId: target.id,
    userId: target.userId,
    role: parsed.data.role,
  });
});

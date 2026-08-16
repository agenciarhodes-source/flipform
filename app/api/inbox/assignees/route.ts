import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

export const GET = withPermission('INBOX_MANAGE', async (_req, session) => {
  if (!['owner', 'admin', 'manager'].includes(session.role)) {
    return NextResponse.json({ error: 'Você não pode atribuir conversas.' }, { status: 403 });
  }

  const tenantUsers = await prisma.tenantUser.findMany({
    where: {
      tenantId: session.tenantId,
      status: 'active',
    },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    assignees: tenantUsers
      .filter((membership) => membership.role !== 'viewer')
      .map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        role: membership.role,
      })),
  });
});

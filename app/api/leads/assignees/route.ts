import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

/**
 * Who can own leads in this company, for the "Atendente" filter of the Kanban.
 * Owners, admins and managers only; inactive people are listed too, since they may still hold leads.
 */
export const GET = withPermission('DASHBOARD_FILTER_BY_ASSIGNEE', async (_req: NextRequest, session) => {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId: session.tenantId, role: { not: 'viewer' } },
    select: { role: true, status: true, user: { select: { id: true, name: true } } },
  });
  const assignees = members
    .map((member) => ({ id: member.user.id, name: member.user.name, role: member.role, active: member.status === 'active' }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'));
  return NextResponse.json({ assignees });
});

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { can } from '@/lib/rbac';

/** The pending suggestion of the Flip AI for this lead, if any. Read only. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId, ...(can(session.role, 'LEADS_VIEW_ALL') ? {} : { assignedTo: session.userId }) },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ suggestion: null });
  const suggestion = await prisma.leadStageSuggestion.findFirst({
    where: { tenantId: session.tenantId, leadId: lead.id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, reason: true, createdAt: true, toStage: { select: { name: true } } },
  });
  return NextResponse.json({
    suggestion: suggestion
      ? { id: suggestion.id, reason: suggestion.reason, createdAt: suggestion.createdAt.toISOString(), toStageName: suggestion.toStage.name }
      : null,
  });
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { resolveOperationalScope, TeamHierarchyError } from '@/lib/team-hierarchy';

const querySchema = z.object({
  period: z.enum(['today', '7d', '30d']).default('30d'),
  scopeTenantUserId: z.string().uuid().optional(),
});

function periodWindow(period: 'today' | '7d' | '30d') {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (period === '7d') start.setDate(start.getDate() - 6);
  if (period === '30d') start.setDate(start.getDate() - 29);
  return { start, end };
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

export const GET = withPermission('DASHBOARD_VIEW', async (req: NextRequest, session) => {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const scope = await resolveOperationalScope(prisma, {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      selectedTenantUserId: parsed.data.scopeTenantUserId,
    });
    const window = periodWindow(parsed.data.period);
    const agentIds = new Set(scope.visibleAgentUserIds);
    const assignedFilter = scope.restrictToAssignees ? { assignedTo: { in: scope.visibleAgentUserIds } } : {};

    const pipelines = await prisma.pipeline.findMany({
      where: { tenantId: session.tenantId, isArchived: false },
      select: { id: true },
    });
    const stages = pipelines.length ? await prisma.pipelineStage.findMany({
      where: { pipelineId: { in: pipelines.map((pipeline) => pipeline.id) }, isArchived: false },
      select: { id: true, pipelineId: true, orderIndex: true },
      orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'asc' }],
    }) : [];
    const finalStageByPipeline = new Map<string, string>();
    for (const stage of stages) finalStageByPipeline.set(stage.pipelineId, stage.id);

    const leads = await prisma.lead.findMany({
      where: {
        tenantId: session.tenantId,
        enteredAt: { gte: window.start, lte: window.end },
        ...assignedFilter,
      },
      select: { id: true, assignedTo: true, pipelineId: true, stageId: true, status: true },
    });

    const purchases = await prisma.leadPurchase.findMany({
      where: { tenantId: session.tenantId, purchaseDate: { gte: window.start, lte: window.end } },
      select: { amountCents: true, lead: { select: { assignedTo: true } } },
    });
    const scopedPurchases = scope.restrictToAssignees
      ? purchases.filter((purchase) => !!purchase.lead.assignedTo && agentIds.has(purchase.lead.assignedTo))
      : purchases;

    const isClosed = (lead: { status: string; pipelineId: string; stageId: string }) =>
      lead.status === 'won' || finalStageByPipeline.get(lead.pipelineId) === lead.stageId;

    const won = leads.filter(isClosed).length;
    const lost = leads.filter((lead) => lead.status === 'lost').length;
    const inProgress = leads.length - won - lost;
    const revenueCents = scopedPurchases.reduce((sum, purchase) => sum + purchase.amountCents, 0);

    const agents = scope.scopeMembers.filter((member) => member.role === 'agent');
    const teamPerformance = agents.map((agent) => {
      const agentLeads = leads.filter((lead) => lead.assignedTo === agent.userId);
      const agentWon = agentLeads.filter(isClosed).length;
      const agentLost = agentLeads.filter((lead) => lead.status === 'lost').length;
      const agentRevenue = scopedPurchases
        .filter((purchase) => purchase.lead.assignedTo === agent.userId)
        .reduce((sum, purchase) => sum + purchase.amountCents, 0);
      return {
        tenantUserId: agent.tenantUserId,
        userId: agent.userId,
        name: agent.name,
        leads: agentLeads.length,
        inProgress: Math.max(0, agentLeads.length - agentWon - agentLost),
        won: agentWon,
        lost: agentLost,
        conversionRate: percent(agentWon, agentLeads.length),
        revenueCents: agentRevenue,
      };
    }).sort((a, b) => b.won - a.won || b.leads - a.leads);

    return NextResponse.json({
      period: parsed.data.period,
      schemaReady: scope.schemaReady,
      hierarchyConfigured: scope.hierarchyConfigured,
      legacyMode: scope.legacyMode,
      selectedTenantUserId: scope.selectedMember?.tenantUserId || null,
      scopeLabel: scope.selectedMember?.name || 'Toda minha operação',
      summary: {
        totalLeads: leads.length,
        inProgress: Math.max(0, inProgress),
        won,
        lost,
        conversionRate: percent(won, leads.length),
        revenueCents,
        teamMembers: scope.scopeMembers.length,
        agents: agents.length,
      },
      viewOptions: scope.visibleMembers
        .filter((member) => ['admin', 'manager', 'agent'].includes(member.role))
        .map((member) => ({ tenantUserId: member.tenantUserId, name: member.name, role: member.role })),
      teamPerformance,
    });
  } catch (error: any) {
    if (error instanceof TeamHierarchyError) {
      const status = error.code === 'FORBIDDEN_SCOPE' ? 403 : 404;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error('team.overview error', error);
    return NextResponse.json({ error: 'Não foi possível carregar a visão consolidada da equipe.' }, { status: 500 });
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { evaluateBillingAccess } from '@/lib/billing-access';
import { getBusinessGroupAccessesForUser, BusinessGroupError } from '@/lib/business-groups';

const querySchema = z.object({
  period: z.enum(['today', '7d', '30d']).default('30d'),
  groupId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
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

export const GET = withAuth(async (req: NextRequest, session) => {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const state = await getBusinessGroupAccessesForUser(prisma, session.userId);
    if (!state.schemaReady) {
      return NextResponse.json({ error: 'Estrutura de grupos empresariais ainda não instalada.', code: 'BUSINESS_GROUP_SCHEMA_NOT_READY' }, { status: 503 });
    }
    if (!state.accesses.length) {
      return NextResponse.json({ error: 'Você não possui acesso a nenhum grupo empresarial.', code: 'BUSINESS_GROUP_FORBIDDEN' }, { status: 403 });
    }

    const group = parsed.data.groupId
      ? state.accesses.find((item) => item.id === parsed.data.groupId)
      : state.accesses[0];
    if (!group) {
      return NextResponse.json({ error: 'Você não possui acesso a este grupo empresarial.', code: 'BUSINESS_GROUP_FORBIDDEN' }, { status: 403 });
    }

    const subscriptions = group.tenants.length
      ? await prisma.subscription.findMany({
          where: { tenantId: { in: group.tenants.map((tenant) => tenant.id) } },
          select: { tenantId: true, status: true, gracePeriodEndsAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const subscriptionByTenant = new Map<string, typeof subscriptions[number]>();
    for (const subscription of subscriptions) {
      if (!subscriptionByTenant.has(subscription.tenantId)) subscriptionByTenant.set(subscription.tenantId, subscription);
    }

    const tenantAccess = group.tenants.map((tenant) => {
      const subscription = subscriptionByTenant.get(tenant.id);
      const billing = evaluateBillingAccess({
        tenantStatus: tenant.status,
        subscriptionStatus: subscription?.status,
        gracePeriodEndsAt: subscription?.gracePeriodEndsAt,
      });
      return { ...tenant, accessAllowed: billing.allowAccess, accessReason: billing.reason };
    });

    if (parsed.data.tenantId && !tenantAccess.some((tenant) => tenant.id === parsed.data.tenantId)) {
      return NextResponse.json({ error: 'Esta empresa não pertence ao seu grupo empresarial.', code: 'BUSINESS_GROUP_FORBIDDEN' }, { status: 403 });
    }
    if (parsed.data.tenantId && !tenantAccess.find((tenant) => tenant.id === parsed.data.tenantId)?.accessAllowed) {
      return NextResponse.json({ error: 'Esta empresa está temporariamente indisponível por situação de acesso/billing.', code: 'tenant_blocked' }, { status: 403 });
    }

    const tenantIds = parsed.data.tenantId
      ? [parsed.data.tenantId]
      : tenantAccess.filter((tenant) => tenant.accessAllowed).map((tenant) => tenant.id);
    const window = periodWindow(parsed.data.period);

    const pipelines = tenantIds.length ? await prisma.pipeline.findMany({
      where: { tenantId: { in: tenantIds }, isArchived: false },
      select: { id: true, tenantId: true },
    }) : [];
    const stages = pipelines.length ? await prisma.pipelineStage.findMany({
      where: { pipelineId: { in: pipelines.map((pipeline) => pipeline.id) }, isArchived: false },
      select: { id: true, pipelineId: true, orderIndex: true },
      orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'asc' }],
    }) : [];
    const finalStageByPipeline = new Map<string, string>();
    for (const stage of stages) finalStageByPipeline.set(stage.pipelineId, stage.id);

    const leads = tenantIds.length ? await prisma.lead.findMany({
      where: { tenantId: { in: tenantIds }, enteredAt: { gte: window.start, lte: window.end } },
      select: { id: true, tenantId: true, pipelineId: true, stageId: true, status: true },
    }) : [];
    const purchases = tenantIds.length ? await prisma.leadPurchase.findMany({
      where: { tenantId: { in: tenantIds }, purchaseDate: { gte: window.start, lte: window.end } },
      select: { tenantId: true, amountCents: true },
    }) : [];
    const members = tenantIds.length ? await prisma.tenantUser.findMany({
      where: { tenantId: { in: tenantIds }, status: 'active' },
      select: { tenantId: true, role: true },
    }) : [];

    const isClosed = (lead: { status: string; pipelineId: string; stageId: string }) =>
      lead.status === 'won' || finalStageByPipeline.get(lead.pipelineId) === lead.stageId;

    const won = leads.filter(isClosed).length;
    const lost = leads.filter((lead) => lead.status === 'lost').length;
    const revenueCents = purchases.reduce((sum, purchase) => sum + purchase.amountCents, 0);

    const tenantPerformance = tenantAccess.map((tenant) => {
      const tenantLeads = leads.filter((lead) => lead.tenantId === tenant.id);
      const tenantWon = tenantLeads.filter(isClosed).length;
      const tenantLost = tenantLeads.filter((lead) => lead.status === 'lost').length;
      const tenantRevenue = purchases
        .filter((purchase) => purchase.tenantId === tenant.id)
        .reduce((sum, purchase) => sum + purchase.amountCents, 0);
      const tenantMembers = members.filter((member) => member.tenantId === tenant.id);
      return {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        accessAllowed: tenant.accessAllowed,
        accessReason: tenant.accessReason,
        leads: tenantLeads.length,
        inProgress: Math.max(0, tenantLeads.length - tenantWon - tenantLost),
        won: tenantWon,
        lost: tenantLost,
        conversionRate: percent(tenantWon, tenantLeads.length),
        revenueCents: tenantRevenue,
        teamMembers: tenantMembers.length,
        agents: tenantMembers.filter((member) => String(member.role) === 'agent').length,
      };
    });

    return NextResponse.json({
      period: parsed.data.period,
      group: { id: group.id, name: group.name, slug: group.slug, role: group.role },
      selectedTenantId: parsed.data.tenantId || null,
      scopeLabel: parsed.data.tenantId
        ? tenantAccess.find((tenant) => tenant.id === parsed.data.tenantId)?.name || 'Unidade'
        : `Toda a operação — ${group.name}`,
      groupOptions: state.accesses.map((item) => ({ id: item.id, name: item.name, role: item.role })),
      tenantOptions: tenantAccess,
      summary: {
        totalLeads: leads.length,
        inProgress: Math.max(0, leads.length - won - lost),
        won,
        lost,
        conversionRate: percent(won, leads.length),
        revenueCents,
        companies: tenantIds.length,
        teamMembers: members.length,
        agents: members.filter((member) => String(member.role) === 'agent').length,
      },
      tenantPerformance,
    });
  } catch (error) {
    if (error instanceof BusinessGroupError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error('business-groups.overview error', error);
    return NextResponse.json({ error: 'Não foi possível carregar a visão consolidada do grupo.' }, { status: 500 });
  }
});

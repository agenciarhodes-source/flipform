import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionFromRequest } from '@/lib/auth';
import { BusinessGroupReadScopeError, resolveBusinessGroupReadScope } from '@/lib/business-group-read-scope';

const querySchema = z.object({
  groupId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  period: z.enum(['today', '7d', '30d', '90d', 'all']).default('30d'),
  q: z.string().trim().max(120).optional(),
  assignedTo: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

function periodStart(period: 'today' | '7d' | '30d' | '90d' | 'all') {
  if (period === 'all') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === '7d') start.setDate(start.getDate() - 6);
  if (period === '30d') start.setDate(start.getDate() - 29);
  if (period === '90d') start.setDate(start.getDate() - 89);
  return start;
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.globalRole === 'platform_admin') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const scope = await resolveBusinessGroupReadScope({
      userId: session.userId,
      groupId: parsed.data.groupId,
      tenantId: parsed.data.tenantId,
    });
    const start = periodStart(parsed.data.period);
    const where: any = { tenantId: { in: scope.tenantIds } };
    if (start) where.enteredAt = { gte: start };
    if (parsed.data.assignedTo) where.assignedTo = parsed.data.assignedTo;
    if (parsed.data.status) where.status = parsed.data.status;
    if (parsed.data.q) {
      where.OR = [
        { name: { contains: parsed.data.q, mode: 'insensitive' } },
        { email: { contains: parsed.data.q, mode: 'insensitive' } },
        { phone: { contains: parsed.data.q } },
      ];
    }

    const [leads, memberships] = scope.tenantIds.length
      ? await Promise.all([
          prisma.lead.findMany({
            where,
            select: {
              id: true,
              tenantId: true,
              name: true,
              email: true,
              phone: true,
              source: true,
              temperature: true,
              status: true,
              enteredAt: true,
              createdAt: true,
              assignedTo: true,
              assignedUser: { select: { id: true, name: true } },
              stage: { select: { id: true, name: true, color: true } },
              form: { select: { id: true, name: true } },
            },
            orderBy: [{ enteredAt: 'desc' }, { createdAt: 'desc' }],
            take: parsed.data.limit,
          }),
          prisma.tenantUser.findMany({
            where: { tenantId: { in: scope.tenantIds }, status: 'active' },
            select: { tenantId: true, userId: true, role: true, user: { select: { name: true } } },
            orderBy: { user: { name: 'asc' } },
          }),
        ])
      : [[], []];

    const tenantById = new Map(scope.tenantOptions.map((tenant) => [tenant.id, tenant]));
    const agentById = new Map<string, { id: string; name: string }>();
    for (const membership of memberships) {
      if (!agentById.has(membership.userId)) {
        agentById.set(membership.userId, { id: membership.userId, name: membership.user.name });
      }
    }

    return NextResponse.json({
      period: parsed.data.period,
      group: { id: scope.group.id, name: scope.group.name, role: scope.group.role },
      selectedTenantId: scope.selectedTenantId,
      scopeLabel: scope.scopeLabel,
      groupOptions: scope.groupOptions,
      tenantOptions: scope.tenantOptions,
      agentOptions: [...agentById.values()],
      leads: leads.map((lead) => {
        const tenant = tenantById.get(lead.tenantId);
        return {
          ...lead,
          company: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof BusinessGroupReadScopeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('business-groups.leads error', error);
    return NextResponse.json({ error: 'Não foi possível carregar os leads do grupo.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionFromRequest } from '@/lib/auth';
import { BusinessGroupReadScopeError, resolveBusinessGroupReadScope } from '@/lib/business-group-read-scope';

const querySchema = z.object({
  groupId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

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

    const where: any = { tenantId: { in: scope.tenantIds } };
    if (parsed.data.status) where.isActive = parsed.data.status === 'active';
    if (parsed.data.q) {
      where.OR = [
        { name: { contains: parsed.data.q, mode: 'insensitive' } },
        { publicTitle: { contains: parsed.data.q, mode: 'insensitive' } },
        { slug: { contains: parsed.data.q, mode: 'insensitive' } },
      ];
    }

    const forms = scope.tenantIds.length
      ? await prisma.form.findMany({
          where,
          select: {
            id: true,
            tenantId: true,
            name: true,
            publicTitle: true,
            slug: true,
            isActive: true,
            leadSource: true,
            createdAt: true,
            updatedAt: true,
            pipeline: { select: { id: true, name: true } },
            initialStage: { select: { id: true, name: true } },
            _count: { select: { leads: true, fields: true } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    const tenantById = new Map(scope.tenantOptions.map((tenant) => [tenant.id, tenant]));

    return NextResponse.json({
      group: { id: scope.group.id, name: scope.group.name, role: scope.group.role },
      selectedTenantId: scope.selectedTenantId,
      scopeLabel: scope.scopeLabel,
      groupOptions: scope.groupOptions,
      tenantOptions: scope.tenantOptions,
      forms: forms.map((form) => {
        const tenant = tenantById.get(form.tenantId);
        return {
          ...form,
          company: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof BusinessGroupReadScopeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('business-groups.forms error', error);
    return NextResponse.json({ error: 'Não foi possível carregar os formulários do grupo.' }, { status: 500 });
  }
}

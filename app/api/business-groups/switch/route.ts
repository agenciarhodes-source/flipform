import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, setSessionCookie } from '@/lib/auth';
import { evaluateBillingAccess } from '@/lib/billing-access';
import {
  getBusinessGroupAccessesForUser,
  findAuthorizedBusinessGroupTenant,
  mapBusinessGroupRoleToTenantRole,
  BusinessGroupError,
} from '@/lib/business-groups';
import { logAudit } from '@/lib/audit';

const bodySchema = z.object({
  groupId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export const POST = withAuth(async (req: NextRequest, session) => {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const state = await getBusinessGroupAccessesForUser(prisma, session.userId);
    if (!state.schemaReady) {
      return NextResponse.json({ error: 'Estrutura de grupos empresariais ainda não instalada.', code: 'BUSINESS_GROUP_SCHEMA_NOT_READY' }, { status: 503 });
    }

    const { group, tenant: allowedTenant } = findAuthorizedBusinessGroupTenant(state, parsed.data);
    const [tenant, subscription] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: allowedTenant.id },
        select: { id: true, name: true, slug: true, status: true },
      }),
      prisma.subscription.findFirst({
        where: { tenantId: allowedTenant.id },
        select: { status: true, gracePeriodEndsAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!tenant) {
      return NextResponse.json({ error: 'Empresa não encontrada.', code: 'BUSINESS_GROUP_TENANT_NOT_FOUND' }, { status: 404 });
    }

    const billing = evaluateBillingAccess({
      tenantStatus: tenant.status,
      subscriptionStatus: subscription?.status,
      gracePeriodEndsAt: subscription?.gracePeriodEndsAt,
    });
    if (!billing.allowAccess) {
      return NextResponse.json({
        error: 'Esta empresa está temporariamente indisponível por situação de acesso/billing.',
        code: 'tenant_blocked',
        reason: billing.reason,
      }, { status: 403 });
    }

    const tenantRole = mapBusinessGroupRoleToTenantRole(group.role);
    await setSessionCookie({
      userId: session.userId,
      tenantId: tenant.id,
      role: tenantRole,
      email: session.email,
      name: session.name,
      tenantSlug: tenant.slug,
      globalRole: session.globalRole || null,
    });

    try {
      await logAudit({
        tenantId: tenant.id,
        userId: session.userId,
        entityType: 'session',
        entityId: session.userId,
        action: 'business_group.tenant_switched',
        metadata: {
          businessGroupId: group.id,
          businessGroupName: group.name,
          businessGroupRole: group.role,
          tenantRole,
        },
      });
    } catch (auditError) {
      console.error('[business-groups.switch][audit]', auditError);
    }

    return NextResponse.json({
      ok: true,
      group: { id: group.id, name: group.name, role: group.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role: tenantRole,
    });
  } catch (error) {
    if (error instanceof BusinessGroupError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error('business-groups.switch error', error);
    return NextResponse.json({ error: 'Não foi possível abrir esta empresa.' }, { status: 500 });
  }
});

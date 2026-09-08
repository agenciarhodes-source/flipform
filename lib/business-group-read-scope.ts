import { prisma } from '@/lib/prisma';
import { evaluateBillingAccess } from '@/lib/billing-access';
import { getBusinessGroupAccessesForUser } from '@/lib/business-groups';

export class BusinessGroupReadScopeError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type BusinessGroupTenantOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  accessAllowed: boolean;
  accessReason: string;
};

export async function resolveBusinessGroupReadScope(input: {
  userId: string;
  groupId?: string | null;
  tenantId?: string | null;
}) {
  const state = await getBusinessGroupAccessesForUser(prisma, input.userId);
  if (!state.schemaReady) {
    throw new BusinessGroupReadScopeError(
      503,
      'BUSINESS_GROUP_SCHEMA_NOT_READY',
      'Estrutura de grupos empresariais ainda não instalada.',
    );
  }
  if (!state.accesses.length) {
    throw new BusinessGroupReadScopeError(
      403,
      'BUSINESS_GROUP_FORBIDDEN',
      'Você não possui acesso a nenhum grupo empresarial.',
    );
  }

  const group = input.groupId
    ? state.accesses.find((item) => item.id === input.groupId)
    : state.accesses[0];
  if (!group) {
    throw new BusinessGroupReadScopeError(
      403,
      'BUSINESS_GROUP_FORBIDDEN',
      'Você não possui acesso a este grupo empresarial.',
    );
  }

  const tenantIds = group.tenants.map((tenant) => tenant.id);
  const subscriptions = tenantIds.length
    ? await prisma.subscription.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, status: true, gracePeriodEndsAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const subscriptionByTenant = new Map<string, typeof subscriptions[number]>();
  for (const subscription of subscriptions) {
    if (!subscriptionByTenant.has(subscription.tenantId)) {
      subscriptionByTenant.set(subscription.tenantId, subscription);
    }
  }

  const tenantOptions: BusinessGroupTenantOption[] = group.tenants.map((tenant) => {
    const subscription = subscriptionByTenant.get(tenant.id);
    const billing = evaluateBillingAccess({
      tenantStatus: tenant.status,
      subscriptionStatus: subscription?.status,
      gracePeriodEndsAt: subscription?.gracePeriodEndsAt,
    });
    return {
      ...tenant,
      accessAllowed: billing.allowAccess,
      accessReason: billing.reason,
    };
  });

  const selectedTenant = input.tenantId
    ? tenantOptions.find((tenant) => tenant.id === input.tenantId)
    : null;
  if (input.tenantId && !selectedTenant) {
    throw new BusinessGroupReadScopeError(
      403,
      'BUSINESS_GROUP_FORBIDDEN',
      'Esta empresa não pertence ao seu grupo empresarial.',
    );
  }
  if (selectedTenant && !selectedTenant.accessAllowed) {
    throw new BusinessGroupReadScopeError(
      403,
      'BUSINESS_GROUP_TENANT_BLOCKED',
      'Esta empresa está temporariamente indisponível por situação de acesso/billing.',
    );
  }

  const readableTenantIds = selectedTenant
    ? [selectedTenant.id]
    : tenantOptions.filter((tenant) => tenant.accessAllowed).map((tenant) => tenant.id);

  return {
    group,
    selectedTenantId: selectedTenant?.id || null,
    tenantIds: readableTenantIds,
    tenantOptions,
    groupOptions: state.accesses.map((item) => ({ id: item.id, name: item.name, role: item.role })),
    scopeLabel: selectedTenant?.name || `Toda a operação — ${group.name}`,
  };
}

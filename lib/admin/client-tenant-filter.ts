import type { Prisma } from '@prisma/client';

/**
 * Canonical predicate for commercial customer companies shown in Admin > Clientes.
 * A tenant is a customer only when the platform admin classified it as one:
 * names, internal notes and the presence of an owner are not evidence.
 */
export function getClientTenantWhere(): Prisma.TenantWhereInput {
  return { accountKind: 'client' };
}

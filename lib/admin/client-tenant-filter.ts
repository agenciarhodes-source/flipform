import type { Prisma } from '@prisma/client';
import { Role } from '@prisma/client';

/**
 * Canonical predicate for commercial customer companies shown in Admin > Clientes.
 * Technical/internal tenants remain available to operational admin tools.
 */
export function getClientTenantWhere(): Prisma.TenantWhereInput {
  return {
    AND: [
      { tenantUsers: { some: { role: Role.owner } } },
      { NOT: { slug: { startsWith: 'internal-' } } },
      { NOT: { name: { startsWith: 'Acesso interno ', mode: 'insensitive' } } },
      {
        OR: [
          { internalNotes: null },
          { NOT: { internalNotes: { contains: 'internal=true' } } },
        ],
      },
    ],
  };
}

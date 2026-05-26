import { Prisma } from '@prisma/client';

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'internal';
}

export async function createInternalTenant(tx: Prisma.TransactionClient, params: { email: string; planId: string; adminUserId: string | null }) {
  const prefix = slugify(params.email.split('@')[0] || 'internal');
  const slug = `internal-${prefix}-${Date.now().toString().slice(-6)}`;
  return tx.tenant.create({
    data: {
      name: `Acesso interno ${params.email}`,
      slug,
      status: 'active',
      planId: params.planId,
      internalNotes: `internal=true;createdByAdmin=true;source=manual_admin_access;adminUserId=${params.adminUserId ?? 'unknown'}`,
    },
  });
}

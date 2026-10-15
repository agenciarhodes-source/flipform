import 'server-only';
import { prisma } from '@/lib/prisma';

export async function getReportTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } });
  return { name: tenant?.name || 'FlipForm', logoUrl: tenant?.logoUrl || null };
}

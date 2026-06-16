import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';

export const DELETE = withPermission('FORM_DOMAINS_EDIT', async (_req, session, ctx: { params: { id: string; routeId: string } }) => {
  const route = await prisma.customFormDomainRoute.findFirst({ where: { id: ctx.params.routeId, domainId: ctx.params.id, tenantId: session.tenantId } });
  if (!route) return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 });
  await prisma.customFormDomainRoute.delete({ where: { id: route.id } });
  if (route.isDefault) await prisma.customFormDomain.updateMany({ where: { id: ctx.params.id, tenantId: session.tenantId }, data: { defaultFormId: null } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain_route', entityId: route.id, action: 'form_domain_route.deleted', metadata: { domainId: route.domainId, path: route.path } });
  return NextResponse.json({ ok: true });
});

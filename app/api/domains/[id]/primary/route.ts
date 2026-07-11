import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';

export const POST = withPermission('DOMAINS_MANAGE', async (_req, session, ctx: { params: { id: string } }) => {
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (domain.status !== 'active' || domain.verificationStatus !== 'verified') return NextResponse.json({ error: 'Verifique e ative o domínio antes de torná-lo principal.' }, { status: 400 });
  await prisma.$transaction([
    prisma.customFormDomain.updateMany({ where: { tenantId: session.tenantId }, data: { isPrimary: false } }),
    prisma.customFormDomain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
  ]);
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'custom_form_domain', entityId: domain.id, action: 'domain.primary_changed', metadata: { domain: domain.domain } });
  return NextResponse.json({ ok: true });
});

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { verifyDomainOnVercel } from '@/lib/custom-form-domains';
import { logAudit } from '@/lib/audit';

export const POST = withPermission('SETTINGS_EDIT', async (_req, session, ctx: { params: { id: string } }) => {
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const result = await verifyDomainOnVercel(domain.domain);
  const updated = await prisma.customFormDomain.update({
    where: { id: domain.id },
    data: {
      status: result.verified ? 'active' : 'pending', verificationStatus: result.verified ? 'verified' : 'pending', sslStatus: result.verified ? 'active' : 'pending',
      vercelVerified: result.verified, lastCheckedAt: new Date(), verifiedAt: result.verified ? new Date() : domain.verifiedAt,
      verificationType: result.instruction.type, verificationDomain: result.instruction.name, verificationValue: result.instruction.value, verificationReason: result.reason || null, dnsTarget: result.instruction.value,
    },
  });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'custom_form_domain', entityId: domain.id, action: result.verified ? 'domain.verified' : 'domain.verification_failed', metadata: { domain: domain.domain, reason: result.reason || null } });
  return NextResponse.json({ domain: updated });
});

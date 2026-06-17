import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { syncDomainWithVercel } from '@/lib/custom-form-domains';
import { logAudit } from '@/lib/audit';

export const POST = withPermission('SETTINGS_EDIT', async (_req, session, ctx: { params: { id: string } }) => {
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const result = await syncDomainWithVercel(domain.domain);
  const updated = await prisma.customFormDomain.update({
    where: { id: domain.id },
    data: {
      status: result.status,
      verificationStatus: result.verificationStatus,
      sslStatus: result.sslStatus,
      vercelVerified: result.existsOnVercel && result.verified,
      lastCheckedAt: new Date(),
      verifiedAt: result.verified && result.sslActive ? (domain.verifiedAt || new Date()) : domain.verifiedAt,
      verificationType: result.instruction.type,
      verificationDomain: result.instruction.name,
      verificationValue: result.instruction.value,
      verificationReason: result.reason || null,
      dnsTarget: result.instruction.value,
      vercelProjectId: process.env.VERCEL_PROJECT_ID || domain.vercelProjectId,
    },
  });
  await logAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'custom_form_domain',
    entityId: domain.id,
    action: result.status === 'active' ? 'domain.verified' : 'domain.verification_pending',
    metadata: { domain: domain.domain, state: result.connection.state, reason: result.reason || null },
  });
  return NextResponse.json({ domain: updated, connection: result.connection });
});

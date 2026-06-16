import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { dnsInstructions } from '@/lib/form-domains';
import { hasVercelDomainConfig, verifyVercelDomain, getVercelDomain } from '@/lib/vercel/domains';

export const POST = withPermission('FORM_DOMAINS_EDIT', async (_req, session, ctx: { params: { id: string } }) => {
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Domínio não encontrado.' }, { status: 404 });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: 'form_domain.verification_requested', metadata: { domain: domain.domain } });
  if (!hasVercelDomainConfig()) {
    const updated = await prisma.customFormDomain.update({ where: { id: domain.id }, data: { lastCheckedAt: new Date(), verificationReason: 'Vercel token ausente; verificação manual necessária.', sslStatus: 'unknown' } });
    return NextResponse.json({ domain: { ...updated, dnsInstructions: dnsInstructions(updated) }, warning: 'Integração automática com Vercel não configurada.' });
  }
  try {
    let vercel = await verifyVercelDomain(domain.domain);
    if (!vercel.verified) vercel = await getVercelDomain(domain.domain);
    const verified = Boolean(vercel.verified);
    const updated = await prisma.customFormDomain.update({ where: { id: domain.id }, data: {
      status: verified ? 'active' : 'pending', verificationStatus: verified ? 'verified' : 'pending', sslStatus: verified ? 'active' : 'pending',
      vercelVerified: verified, verificationType: vercel.verificationType || null, verificationDomain: vercel.verificationDomain || null,
      verificationValue: vercel.verificationValue || null, verificationReason: vercel.verificationReason || null, dnsTarget: vercel.dnsTarget || domain.dnsTarget,
      lastCheckedAt: new Date(), verifiedAt: verified ? new Date() : domain.verifiedAt,
    }});
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: verified ? 'form_domain.verified' : 'form_domain.verification_failed', metadata: { domain: domain.domain, reason: updated.verificationReason } });
    return NextResponse.json({ domain: { ...updated, dnsInstructions: dnsInstructions(updated) } });
  } catch (error: any) {
    const updated = await prisma.customFormDomain.update({ where: { id: domain.id }, data: { status: 'error', verificationStatus: 'failed', sslStatus: 'unknown', lastCheckedAt: new Date(), verificationReason: error.message || 'Não foi possível verificar domínio.' } });
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: 'form_domain.verification_failed', metadata: { domain: domain.domain, error: updated.verificationReason } });
    return NextResponse.json({ error: updated.verificationReason, domain: updated }, { status: 502 });
  }
});

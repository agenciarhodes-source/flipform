import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { dnsInstructions, validateCustomDomain } from '@/lib/form-domains';
import { addDomainToVercel, hasVercelDomainConfig } from '@/lib/vercel/domains';

function serializeDomain(domain: any) {
  return { ...domain, dnsInstructions: dnsInstructions(domain), vercelConfigured: hasVercelDomainConfig() };
}

export const GET = withPermission('FORM_DOMAINS_VIEW', async (_req, session) => {
  const [domains, forms] = await Promise.all([
    prisma.customFormDomain.findMany({
      where: { tenantId: session.tenantId },
      include: { defaultForm: { select: { id: true, name: true, slug: true } }, routes: { include: { form: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.form.findMany({ where: { tenantId: session.tenantId, isActive: true }, select: { id: true, name: true, slug: true, publicTitle: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  return NextResponse.json({ domains: domains.map(serializeDomain), forms, vercelConfigured: hasVercelDomainConfig() });
});

export const POST = withPermission('FORM_DOMAINS_CREATE', async (req, session) => {
  const body = await req.json().catch(() => ({}));
  const parsed = validateCustomDomain(String(body.domain || ''));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await prisma.customFormDomain.findUnique({ where: { domain: parsed.domain } });
  if (existing && existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'Domínio já usado por outro cliente.' }, { status: 409 });
  if (existing) return NextResponse.json({ domain: serializeDomain(existing), warning: parsed.warning });

  let vercel: any = null;
  let status = 'pending';
  let verificationStatus = 'pending';
  let sslStatus = 'pending';
  let verificationReason: string | null = hasVercelDomainConfig() ? null : 'Integração automática com Vercel não configurada.';
  if (hasVercelDomainConfig()) {
    try {
      vercel = await addDomainToVercel(parsed.domain);
      if (vercel.verified) { status = 'active'; verificationStatus = 'verified'; sslStatus = 'active'; }
    } catch (error: any) {
      status = 'error'; verificationStatus = 'failed'; sslStatus = 'unknown'; verificationReason = error.message || 'Erro ao adicionar domínio na Vercel.';
    }
  }

  const domain = await prisma.customFormDomain.create({ data: {
    tenantId: session.tenantId, domain: parsed.domain, status, verificationStatus, sslStatus,
    vercelProjectId: process.env.VERCEL_PROJECT_ID || null, vercelVerified: Boolean(vercel?.verified),
    verificationType: vercel?.verificationType || null, verificationDomain: vercel?.verificationDomain || null,
    verificationValue: vercel?.verificationValue || null, verificationReason: vercel?.verificationReason || verificationReason,
    dnsTarget: vercel?.dnsTarget || null, lastCheckedAt: hasVercelDomainConfig() ? new Date() : null,
    verifiedAt: vercel?.verified ? new Date() : null,
  }});
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: 'form_domain.created', metadata: { domain: domain.domain, vercelConfigured: hasVercelDomainConfig() } });
  return NextResponse.json({ domain: serializeDomain(domain), warning: parsed.warning }, { status: 201 });
});

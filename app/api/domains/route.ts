import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { syncVercelProjectDomain, buildCustomFormDomainFromFullDomain, buildCustomFormDomainFromRoot, getConfiguredAppDomain, getManualDnsInstruction, REQUIRED_FORM_SUBDOMAIN } from '@/lib/custom-form-domains';
import { logAudit } from '@/lib/audit';

export const GET = withPermission('SETTINGS_VIEW', async (_req, session) => {
  const domains = await prisma.customFormDomain.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] });
  return NextResponse.json({ domains, appDomain: getConfiguredAppDomain() });
});

export const POST = withPermission('SETTINGS_EDIT', async (req, session) => {
  try {
    const body = await req.json();
    if (body.subdomain && String(body.subdomain).trim().toLowerCase() !== REQUIRED_FORM_SUBDOMAIN) {
      return NextResponse.json({ error: 'O subdomínio dos formulários deve ser sempre leads.' }, { status: 400 });
    }
    const validated = body.rootDomain
      ? buildCustomFormDomainFromRoot(String(body.rootDomain || ''))
      : buildCustomFormDomainFromFullDomain(String(body.domain || ''));
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const existing = await prisma.customFormDomain.findUnique({ where: { domain: validated.domain } });
    if (existing && existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'Este domínio já está vinculado a outra conta.' }, { status: 409 });
    if (existing) return NextResponse.json({ error: 'Este domínio já está cadastrado nesta conta.' }, { status: 409 });

    const vercel = await syncVercelProjectDomain(validated.domain);
    const instruction = vercel.instruction || getManualDnsInstruction(validated.domain);
    const count = await prisma.customFormDomain.count({ where: { tenantId: session.tenantId } });
    const domain = await prisma.customFormDomain.create({
      data: {
        tenantId: session.tenantId,
        domain: validated.domain,
        isPrimary: count === 0,
        vercelProjectId: process.env.VERCEL_PROJECT_ID || null,
        dnsTarget: instruction.value,
        verificationType: instruction.type,
        verificationDomain: instruction.name,
        verificationValue: instruction.value,
        verificationReason: vercel.reason || null,
        status: vercel.status || 'pending',
        verificationStatus: vercel.verificationStatus || 'pending',
        sslStatus: vercel.sslStatus || 'pending',
        vercelVerified: Boolean(vercel.existsOnVercel && vercel.verified),
        lastCheckedAt: new Date(),
      },
    });
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'custom_form_domain', entityId: domain.id, action: 'domain.created', metadata: { domain: domain.domain } });
    return NextResponse.json({ domain, connectionState: vercel.connectionState, connection: vercel.connection }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro ao cadastrar domínio.' }, { status: 500 });
  }
});

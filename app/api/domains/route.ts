import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { addDomainToVercel, buildCustomFormDomainFromParts, getConfiguredAppDomain, getManualDnsInstruction, validateCustomFormDomain } from '@/lib/custom-form-domains';
import { logAudit } from '@/lib/audit';

export const GET = withPermission('SETTINGS_VIEW', async (_req, session) => {
  const domains = await prisma.customFormDomain.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] });
  return NextResponse.json({ domains, appDomain: getConfiguredAppDomain() });
});

export const POST = withPermission('SETTINGS_EDIT', async (req, session) => {
  try {
    const body = await req.json();
    const validated = body.rootDomain || body.subdomain
      ? buildCustomFormDomainFromParts(String(body.rootDomain || ''), String(body.subdomain || 'leads'))
      : validateCustomFormDomain(String(body.domain || ''));
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const existing = await prisma.customFormDomain.findUnique({ where: { domain: validated.domain } });
    if (existing && existing.tenantId !== session.tenantId) return NextResponse.json({ error: 'Este domínio já está vinculado a outra conta.' }, { status: 409 });
    if (existing) return NextResponse.json({ error: 'Domínio já cadastrado.' }, { status: 409 });

    const vercel = await addDomainToVercel(validated.domain);
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
      },
    });
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'custom_form_domain', entityId: domain.id, action: 'domain.created', metadata: { domain: domain.domain } });
    return NextResponse.json({ domain }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro ao cadastrar domínio.' }, { status: 500 });
  }
});

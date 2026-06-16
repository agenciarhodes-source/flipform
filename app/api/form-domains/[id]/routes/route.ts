import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { routeSchema } from '@/lib/form-domains';

export const POST = withPermission('FORM_DOMAINS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json().catch(() => ({}));
  const parsed = routeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Domínio não encontrado.' }, { status: 404 });
  const form = await prisma.form.findFirst({ where: { id: parsed.data.formId, tenantId: session.tenantId, isActive: true } });
  if (!form) return NextResponse.json({ error: 'Formulário inválido.' }, { status: 400 });
  const route = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault || parsed.data.path === '/') await tx.customFormDomainRoute.updateMany({ where: { domainId: domain.id }, data: { isDefault: false } });
    const r = await tx.customFormDomainRoute.upsert({
      where: { domainId_path: { domainId: domain.id, path: parsed.data.path } },
      update: { formId: form.id, tenantId: session.tenantId, isDefault: parsed.data.isDefault || parsed.data.path === '/' },
      create: { tenantId: session.tenantId, domainId: domain.id, formId: form.id, path: parsed.data.path, isDefault: parsed.data.isDefault || parsed.data.path === '/' },
    });
    if (r.isDefault || r.path === '/') await tx.customFormDomain.update({ where: { id: domain.id }, data: { defaultFormId: form.id } });
    return r;
  });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain_route', entityId: route.id, action: 'form_domain_route.created', metadata: { domainId: domain.id, formId: form.id, path: route.path } });
  return NextResponse.json({ route }, { status: 201 });
});

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { updateDomainSchema } from '@/lib/form-domains';

export const PUT = withPermission('FORM_DOMAINS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const body = await req.json().catch(() => ({}));
  const parsed = updateDomainSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!domain) return NextResponse.json({ error: 'Domínio não encontrado.' }, { status: 404 });
  if (parsed.data.defaultFormId) {
    const form = await prisma.form.findFirst({ where: { id: parsed.data.defaultFormId, tenantId: session.tenantId } });
    if (!form) return NextResponse.json({ error: 'Formulário inválido.' }, { status: 400 });
  }
  const updated = await prisma.customFormDomain.update({ where: { id: domain.id }, data: { defaultFormId: parsed.data.defaultFormId ?? undefined, status: parsed.data.status ?? undefined } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: 'form_domain.updated', metadata: parsed.data });
  return NextResponse.json({ domain: updated });
});

export const DELETE = withPermission('FORM_DOMAINS_DELETE', async (_req, session, ctx: { params: { id: string } }) => {
  const domain = await prisma.customFormDomain.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, include: { routes: true } });
  if (!domain) return NextResponse.json({ error: 'Domínio não encontrado.' }, { status: 404 });
  if (domain.routes.length) return NextResponse.json({ error: 'Remova as rotas antes de excluir este domínio.' }, { status: 409 });
  await prisma.customFormDomain.delete({ where: { id: domain.id } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form_domain', entityId: domain.id, action: 'form_domain.deleted', metadata: { domain: domain.domain, vercelRemoval: 'manual' } });
  return NextResponse.json({ ok: true });
});

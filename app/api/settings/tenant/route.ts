import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { tenantUpdateSchema } from '@/lib/schemas-tenant';

export const GET = withPermission('SETTINGS_VIEW', async (_req, session) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true, name: true, slug: true, primaryColor: true, logoUrl: true,
      status: true, createdAt: true, updatedAt: true,
      _count: { select: { tenantUsers: true, leads: true, forms: true, pipelines: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
  return NextResponse.json({ tenant });
});

export const PUT = withPermission('SETTINGS_EDIT', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = tenantUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    const data = parsed.data;

    const current = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    if (!current) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    // Slug uniqueness (apenas se mudou)
    if (data.slug && data.slug !== current.slug) {
      const exists = await prisma.tenant.findUnique({ where: { slug: data.slug } });
      if (exists) return NextResponse.json({ error: 'Este slug já está em uso por outra empresa.' }, { status: 409 });
    }

    const updates: any = {};
    const changes: Record<string, { from: any; to: any }> = {};
    const auditActions: string[] = [];

    if (data.name !== undefined && data.name !== current.name) {
      updates.name = data.name; changes.name = { from: current.name, to: data.name };
    }
    if (data.slug !== undefined && data.slug !== current.slug) {
      updates.slug = data.slug; changes.slug = { from: current.slug, to: data.slug };
      auditActions.push('tenant.slug_updated');
    }
    if (data.primaryColor !== undefined && data.primaryColor !== current.primaryColor) {
      updates.primaryColor = data.primaryColor; changes.primaryColor = { from: current.primaryColor, to: data.primaryColor };
      auditActions.push('tenant.color_updated');
    }
    if (data.logoUrl !== undefined) {
      const normalized = data.logoUrl === '' ? null : data.logoUrl;
      if (normalized !== current.logoUrl) {
        updates.logoUrl = normalized; changes.logoUrl = { from: current.logoUrl, to: normalized };
        auditActions.push('tenant.logo_updated');
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }

    const updated = await prisma.tenant.update({ where: { id: session.tenantId }, data: updates });

    // Audit log geral
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'tenant', entityId: session.tenantId, action: 'tenant.updated',
      metadata: { changes, subActions: auditActions },
    });
    // Audit logs específicos
    for (const act of auditActions) {
      await logAudit({
        tenantId: session.tenantId, userId: session.userId,
        entityType: 'tenant', entityId: session.tenantId, action: act,
        metadata: { value: changes[act.split('.')[1].replace('_updated', '') as keyof typeof changes] },
      });
    }

    return NextResponse.json({
      ok: true,
      tenant: {
        id: updated.id, name: updated.name, slug: updated.slug,
        primaryColor: updated.primaryColor, logoUrl: updated.logoUrl,
        status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
      },
    });
  } catch (e: any) {
    console.error('settings.tenant.update error', e);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
});

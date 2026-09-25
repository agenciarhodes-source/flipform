import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { tenantBrandingUpdateSchema } from '@/lib/schemas-tenant';

export const PUT = withPermission('BRANDING_EDIT', async (req, session) => {
  try {
    const parsed = tenantBrandingUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const current = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryColor: true,
        logoUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!current) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });

    const updates: {
      name?: string;
      primaryColor?: string;
      logoUrl?: string | null;
    } = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (parsed.data.name !== undefined && parsed.data.name !== current.name) {
      updates.name = parsed.data.name;
      changes.name = { from: current.name, to: parsed.data.name };
    }

    if (parsed.data.primaryColor !== undefined && parsed.data.primaryColor !== current.primaryColor) {
      updates.primaryColor = parsed.data.primaryColor;
      changes.primaryColor = { from: current.primaryColor, to: parsed.data.primaryColor };
    }

    if (parsed.data.logoUrl !== undefined) {
      const normalizedLogo = parsed.data.logoUrl === '' ? null : parsed.data.logoUrl;
      if (normalizedLogo !== current.logoUrl) {
        updates.logoUrl = normalizedLogo;
        changes.logoUrl = {
          from: current.logoUrl ? '[configured]' : null,
          to: normalizedLogo ? '[configured]' : null,
        };
      }
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: true, noop: true, tenant: current });
    }

    const updated = await prisma.tenant.update({
      where: { id: session.tenantId },
      data: updates,
      select: {
        id: true,
        name: true,
        slug: true,
        primaryColor: true,
        logoUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'tenant',
      entityId: session.tenantId,
      action: 'tenant.branding_updated',
      metadata: { changes },
    });

    return NextResponse.json({ ok: true, tenant: updated });
  } catch (error) {
    console.error('settings.branding.update error', error);
    return NextResponse.json({ error: 'Erro ao atualizar a identidade visual.' }, { status: 500 });
  }
});

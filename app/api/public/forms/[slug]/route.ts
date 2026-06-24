import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BLOCKED_TENANT_STATUSES = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const form = await prisma.form.findFirst({
    where: { slug: ctx.params.slug, isActive: true },
    include: {
      fields: { orderBy: { orderIndex: 'asc' } },
      tenant: { select: { id: true, status: true, name: true, logoUrl: true, primaryColor: true } },
    },
  });
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 });
  if (BLOCKED_TENANT_STATUSES.has(String(form.tenant.status))) {
    return NextResponse.json({ error: 'Este formulário está temporariamente indisponível.', code: 'tenant_blocked' }, { status: 410 });
  }
  return NextResponse.json({
    form: {
      id: form.id,
      slug: form.slug,
      publicTitle: form.publicTitle,
      publicDescription: form.publicDescription,
      primaryColor: form.primaryColor,
      bgColor: form.bgColor,
      buttonColor: form.buttonColor,
      textColor: form.textColor,
      theme: form.theme,
      coverImageUrl: form.coverImageUrl,
      successMessage: form.successMessage,
      logoUrl: form.logoUrl || form.tenant.logoUrl,
      tenantName: form.tenant.name,
      fields: form.fields,
      disqualificationSettings: form.disqualificationSettings,
    },
  });
}

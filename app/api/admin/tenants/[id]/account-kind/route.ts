import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { tenantAccountKindSchema } from '@/lib/admin/tenant-account-kind';

export const PUT = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const parsed = tenantAccountKindSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tipo de conta inválido.' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, accountKind: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });

  const accountKind = parsed.data.accountKind;
  if (accountKind === tenant.accountKind) return NextResponse.json({ ok: true, unchanged: true, accountKind });

  // Classification only: status, plan, users, leads and integrations are not touched.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { accountKind } });
  await logPlatformAudit({
    tenantId: tenant.id,
    userId: session.userId,
    entityType: 'tenant',
    entityId: tenant.id,
    action: 'platform.tenant_account_kind_changed',
    metadata: { previous: tenant.accountKind, next: accountKind },
  });

  return NextResponse.json({ ok: true, accountKind });
});

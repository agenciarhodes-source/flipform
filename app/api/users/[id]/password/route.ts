import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { canManageRole } from '@/lib/rbac';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { companyMayResetPassword, passwordResetSchema } from '@/lib/password-reset-rules';

/**
 * "Redefinir senha" on the Users page: the owner or an admin sets a new password for someone of
 * this company who forgot theirs. Only for people who use this company alone. Every open session of
 * that person ends. The password is never logged.
 */
export const POST = withPermission('USERS_EDIT', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = passwordResetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 });

  const target = await prisma.tenantUser.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { role: true, userId: true, user: { select: { email: true, globalRole: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  const companies = await prisma.tenantUser.count({ where: { userId: target.userId } });
  const allowed = companyMayResetPassword({
    isSelf: target.userId === session.userId,
    targetIsPlatformAdmin: target.user.globalRole === 'platform_admin',
    targetRole: target.role,
    canManageTargetRole: canManageRole(session.role, target.role as never, session.globalRole),
    targetCompanies: companies,
  });
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status });

  await prisma.user.update({
    where: { id: target.userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
  });
  await logAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'user',
    entityId: target.userId,
    action: 'auth.password_reset_by_admin',
    metadata: { email: target.user.email, source: 'company_users_page' },
  });
  return NextResponse.json({ ok: true });
});

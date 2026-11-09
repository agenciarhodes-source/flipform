import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { passwordResetSchema } from '@/lib/password-reset-rules';

/**
 * Forgotten password: the Super Admin sets a new one for someone, after confirming who they are.
 * Works for people who use several companies too. Every open session of that person ends; the
 * reason is kept in the platform audit log and the password is never logged.
 */
export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string; tenantUserId: string } }) => {
  const parsed = passwordResetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 });
  const reason = parsed.data.reason?.trim() || '';
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Descreva como a identidade foi confirmada (mínimo 10 caracteres).' }, { status: 400 });
  }

  const target = await prisma.tenantUser.findFirst({
    where: { id: ctx.params.tenantUserId, tenantId: ctx.params.id },
    select: { userId: true, user: { select: { email: true, globalRole: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Usuário da empresa não encontrado.' }, { status: 404 });
  if (target.user.globalRole === 'platform_admin' && target.userId !== session.userId) {
    return NextResponse.json({ error: 'A senha de outro Super Admin só pode ser trocada pela própria pessoa.' }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: target.userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
  });
  await logPlatformAudit({
    tenantId: ctx.params.id, userId: session.userId,
    entityType: 'user', entityId: target.userId, action: 'platform.user_password_reset',
    metadata: { email: target.user.email, reason },
  });
  return NextResponse.json({ ok: true });
});

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, verifyPassword, hashPassword, clearSessionCookie } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmNewPassword } = parsed.data;

  if (newPassword !== confirmNewPassword) {
    return NextResponse.json({ error: 'Confirmação da nova senha não confere.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 });

  const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return NextResponse.json({ error: 'A nova senha deve ser diferente da senha atual.' }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  if (session.tenantId) {
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'user',
      entityId: session.userId,
      action: 'auth.password_changed',
      metadata: { source: 'self_service' },
    });
  }

  clearSessionCookie();
  return NextResponse.json({ ok: true, message: 'Senha alterada com sucesso. Faça login novamente.' });
});

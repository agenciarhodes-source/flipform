import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { markFirstAccessTokenUsed, resolveFirstAccessToken } from '@/lib/first-access';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `first-access:complete:ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => ({} as any));
  const token = String(body.token || '');
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!token || password.length < 8 || confirmPassword.length < 8) {
    return NextResponse.json({ error: 'Dados inválidos.', code: 'INVALID_INPUT' }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'As senhas não conferem.', code: 'PASSWORD_MISMATCH' }, { status: 400 });
  }

  const resolved = await resolveFirstAccessToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ error: 'Link inválido ou expirado.', code: 'INVALID_OR_EXPIRED_FIRST_ACCESS_TOKEN' }, { status: 400 });
  }

  const { rec } = resolved;

  const result = await prisma.$transaction(async (tx) => {
    const hashed = await hashPassword(password);
    let user = await tx.user.findUnique({ where: { email: rec.email } });
    if (!user) {
      user = await tx.user.create({ data: { email: rec.email, name: rec.email.split('@')[0], passwordHash: hashed } });
    } else {
      user = await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashed } });
    }

    const tu = await tx.tenantUser.findFirst({ where: { tenantId: rec.tenantId, userId: user.id } });
    if (!tu) {
      await tx.tenantUser.create({ data: { tenantId: rec.tenantId, userId: user.id, role: 'owner', status: 'active' } });
    } else if (tu.status !== 'active') {
      await tx.tenantUser.update({ where: { id: tu.id }, data: { status: 'active' } });
    }

    await tx.allowedUser.updateMany({ where: { email: rec.email, tenantId: rec.tenantId }, data: { active: true, status: 'active', acceptedAt: new Date() } });
    await tx.firstAccessToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });

    return { userId: user.id };
  });

  await logAudit({ tenantId: rec.tenantId, userId: result.userId, entityType: 'first_access', entityId: rec.email, action: 'first_access.password_set' });
  return NextResponse.json({ ok: true, message: 'Senha definida com sucesso.' });
}

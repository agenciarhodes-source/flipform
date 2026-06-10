import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { resolveFirstAccessToken } from '@/lib/first-access';

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
    const code = (resolved as any).code || 'INVALID_FIRST_ACCESS_TOKEN';
    const errorByCode: Record<string, string> = {
      EXPIRED_FIRST_ACCESS_TOKEN: 'Este link expirou. Solicite um novo link ou fale com o suporte.',
      USED_FIRST_ACCESS_TOKEN: 'Este link já foi utilizado. Faça login para acessar sua conta.',
      INVALID_FIRST_ACCESS_TOKEN: 'Link inválido. Verifique o endereço ou fale com o suporte.',
    };
    return NextResponse.json({ error: errorByCode[code] || errorByCode.INVALID_FIRST_ACCESS_TOKEN, code }, { status: 400 });
  }

  const { rec } = resolved;

  try {
    const result = await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
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
      const markUsed = await tx.firstAccessToken.updateMany({
        where: { id: rec.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (markUsed.count !== 1) {
        throw new Error('FIRST_ACCESS_ALREADY_USED_OR_EXPIRED');
      }

      return { userId: user.id };
    });

    await logAudit({ tenantId: rec.tenantId, userId: result.userId, entityType: 'first_access', entityId: rec.email, action: 'first_access.password_set' });
    await logAudit({ tenantId: rec.tenantId, userId: result.userId, entityType: 'first_access', entityId: rec.email, action: 'first_access.completed' });
    return NextResponse.json({ ok: true, message: 'Senha definida com sucesso.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'FIRST_ACCESS_ALREADY_USED_OR_EXPIRED') {
      return NextResponse.json({ error: 'Este link já foi utilizado ou expirou. Solicite um novo acesso.', code: 'USED_OR_EXPIRED_FIRST_ACCESS_TOKEN' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível concluir o primeiro acesso agora.', code: 'FIRST_ACCESS_COMPLETE_FAILED' }, { status: 500 });
  }
}

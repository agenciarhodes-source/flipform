import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { resolveFirstAccessToken } from '@/lib/first-access';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `first-access:validate:ip:${ip}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const token = new URL(req.url).searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Link inválido ou expirado.', code: 'INVALID_OR_EXPIRED_FIRST_ACCESS_TOKEN' }, { status: 400 });

  const resolved = await resolveFirstAccessToken(token);
  if (!resolved.ok) {
    const code = (resolved as any).code || 'INVALID_FIRST_ACCESS_TOKEN';
    const errorByCode: Record<string, string> = {
      EXPIRED_FIRST_ACCESS_TOKEN: 'Este link expirou. Solicite um novo link ou fale com o suporte.',
      USED_FIRST_ACCESS_TOKEN: 'Este link já foi utilizado. Faça login para acessar sua conta.',
      INVALID_FIRST_ACCESS_TOKEN: 'Link inválido. Verifique o endereço ou fale com o suporte.',
    };
    const auditByCode: Record<string, string> = {
      EXPIRED_FIRST_ACCESS_TOKEN: 'first_access.token_expired',
      USED_FIRST_ACCESS_TOKEN: 'first_access.token_used',
      INVALID_FIRST_ACCESS_TOKEN: 'first_access.token_invalid',
    };
    await logAudit({ tenantId: 'unknown', entityType: 'first_access', entityId: 'unknown', action: auditByCode[code] || 'first_access.token_invalid' });
    return NextResponse.json({ error: errorByCode[code] || errorByCode.INVALID_FIRST_ACCESS_TOKEN, code }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: resolved.rec.tenantId }, select: { name: true } });
  await logAudit({ tenantId: resolved.rec.tenantId, entityType: 'first_access', entityId: resolved.rec.email, action: 'first_access.token_validated' });
  return NextResponse.json({ ok: true, email: resolved.rec.email, tenantName: tenant?.name || '' });
}

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
    if ((resolved as any).expired) {
      await logAudit({ tenantId: 'unknown', entityType: 'first_access', entityId: 'unknown', action: 'first_access.token_expired' });
    } else {
      await logAudit({ tenantId: 'unknown', entityType: 'first_access', entityId: 'unknown', action: 'first_access.token_invalid' });
    }
    return NextResponse.json({ error: 'Link inválido ou expirado.', code: 'INVALID_OR_EXPIRED_FIRST_ACCESS_TOKEN' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: resolved.rec.tenantId }, select: { name: true } });
  return NextResponse.json({ ok: true, email: resolved.rec.email, tenantName: tenant?.name || '' });
}

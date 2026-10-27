import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { setSessionCookie } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { confirmUserMfaCode, readMfaChallenge } from '@/lib/mfa/server';

const bodySchema = z.object({
  mfaToken: z.string().min(20).max(8_000),
  code: z.string().trim().min(6).max(20),
}).strict();

/** Second step of the sign-in (security protocol S5): the 6-digit code or a recovery code. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe o código de 6 dígitos.' }, { status: 400 });
  const challenge = readMfaChallenge(parsed.data.mfaToken);
  if (!challenge) return NextResponse.json({ error: 'O tempo para digitar o código acabou. Entre novamente.', code: 'mfa_expired' }, { status: 401 });

  const ip = getClientIp(req);
  for (const key of [`mfa:ip:${ip}`, `mfa:user:${challenge.session.userId}`]) {
    const limit = await rateLimit({ key, limit: 8, windowMs: 10 * 60_000 });
    if (!limit.allowed) return rateLimitResponse(limit);
  }

  const valid = await confirmUserMfaCode(challenge.session.userId, parsed.data.code);
  if (!valid) {
    await logPlatformAudit({
      tenantId: challenge.session.tenantId || null, userId: challenge.session.userId,
      entityType: 'session', entityId: challenge.session.userId, action: 'auth.mfa_failed',
    });
    return NextResponse.json({ error: 'Código inválido. Confira o aplicativo e tente de novo.' }, { status: 401 });
  }

  await setSessionCookie(challenge.session);
  if (challenge.session.tenantId) {
    await prisma.tenant.update({ where: { id: challenge.session.tenantId }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
  }
  await logPlatformAudit({
    tenantId: challenge.session.tenantId || null, userId: challenge.session.userId,
    entityType: 'session', entityId: challenge.session.userId, action: 'auth.login_mfa',
  });
  return NextResponse.json(challenge.response);
}

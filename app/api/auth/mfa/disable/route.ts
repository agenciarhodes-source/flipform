import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getVerifiedSessionFromRequest } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { confirmUserMfaCode } from '@/lib/mfa/server';

const bodySchema = z.object({ code: z.string().trim().min(6).max(20) }).strict();

/** Turns the two-step verification off (security protocol S5): needs a current code or a recovery code. */
export async function POST(req: NextRequest) {
  const session = await getVerifiedSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  }
  const limit = await rateLimit({ key: `mfa-disable:${session.userId}`, limit: 8, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe o código do aplicativo.' }, { status: 400 });

  if (!await confirmUserMfaCode(session.userId, parsed.data.code)) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnabledAt: null,
      mfaLastCounter: null, mfaRecoveryHashes: [],
    },
  });
  await logPlatformAudit({
    tenantId: session.tenantId || null, userId: session.userId,
    entityType: 'user', entityId: session.userId, action: 'auth.mfa_disabled',
  });
  return NextResponse.json({ ok: true });
}

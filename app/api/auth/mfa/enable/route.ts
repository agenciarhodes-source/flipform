import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getVerifiedSessionFromRequest } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { generateRecoveryCodes, hashRecoveryCode, verifyTotp } from '@/lib/mfa/totp';

const bodySchema = z.object({ code: z.string().trim().min(6).max(10) }).strict();

/**
 * Step 2 (security protocol S5): the first code from the app confirms it was set up right. The
 * verification turns on and the recovery codes are shown once; only their hashes are kept.
 */
export async function POST(req: NextRequest) {
  const session = await getVerifiedSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  }
  const limit = await rateLimit({ key: `mfa-enable:${session.userId}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe o código de 6 dígitos.' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaEnabledAt: true, mfaPendingSecretEncrypted: true },
  });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.mfaEnabledAt) return NextResponse.json({ error: 'A verificação em duas etapas já está ligada.' }, { status: 409 });
  const secret = decryptIntegrationSecret(user.mfaPendingSecretEncrypted);
  if (!secret) return NextResponse.json({ error: 'Comece de novo: clique em "Ativar" para gerar o QR code.' }, { status: 400 });
  const counter = verifyTotp(secret, parsed.data.code, Date.now());
  if (counter === null) return NextResponse.json({ error: 'Código inválido. Confira a hora do celular e tente de novo.' }, { status: 400 });

  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      mfaSecretEncrypted: user.mfaPendingSecretEncrypted,
      mfaPendingSecretEncrypted: null,
      mfaEnabledAt: new Date(),
      mfaLastCounter: counter,
      mfaRecoveryHashes: recoveryCodes.map(hashRecoveryCode),
    },
  });
  await logPlatformAudit({
    tenantId: session.tenantId || null, userId: session.userId,
    entityType: 'user', entityId: session.userId, action: 'auth.mfa_enabled',
  });
  return NextResponse.json({ ok: true, recoveryCodes }, { headers: { 'Cache-Control': 'private, no-store' } });
}

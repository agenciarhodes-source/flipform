import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { getVerifiedSessionFromRequest } from '@/lib/auth';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { generateTotpSecret, otpauthUri } from '@/lib/mfa/totp';

/**
 * Step 1 of turning on the two-step verification (security protocol S5): a new secret, kept
 * encrypted as "pending" until the person confirms a code from the app. Shown once as QR code
 * and as text, for typing it in the app.
 */
export async function POST(req: NextRequest) {
  const session = await getVerifiedSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, mfaEnabledAt: true } });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.mfaEnabledAt) return NextResponse.json({ error: 'A verificação em duas etapas já está ligada.' }, { status: 409 });

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: session.userId }, data: { mfaPendingSecretEncrypted: encryptIntegrationSecret(secret) } });
  const uri = otpauthUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return NextResponse.json({ secret, qrDataUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
}

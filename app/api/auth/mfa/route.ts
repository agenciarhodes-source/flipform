import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedSessionFromRequest } from '@/lib/auth';

/** Whether the two-step verification is on for the person signed in (security protocol S5). */
export async function GET(req: NextRequest) {
  const session = await getVerifiedSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaEnabledAt: true, mfaRecoveryHashes: true },
  });
  const recovery = Array.isArray(user?.mfaRecoveryHashes) ? user!.mfaRecoveryHashes.length : 0;
  return NextResponse.json({
    enabled: Boolean(user?.mfaEnabledAt),
    enabledAt: user?.mfaEnabledAt?.toISOString() || null,
    recoveryCodesLeft: user?.mfaEnabledAt ? recovery : 0,
    recommended: session.role === 'owner' || session.globalRole === 'platform_admin',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

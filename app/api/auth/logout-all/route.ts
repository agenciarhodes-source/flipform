import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clearSessionCookie, getVerifiedSessionFromRequest } from '@/lib/auth';
import { forgetSessionAccess } from '@/lib/session-access';
import { logAudit } from '@/lib/audit';

/**
 * "Sair de todos os aparelhos" (security protocol S2): raises the user's session version, so every
 * login token issued before stops working, on any device, within seconds.
 */
export async function POST(req: NextRequest) {
  const session = await getVerifiedSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  }
  await prisma.user.update({ where: { id: session.userId }, data: { sessionVersion: { increment: 1 } } });
  forgetSessionAccess(session.userId);
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'session', entityId: session.userId, action: 'auth.logout_all',
  });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const session = await getSession();
  if (session) {
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'session', entityId: session.userId, action: 'auth.logout',
    });
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}

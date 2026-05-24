import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

export const POST = withAuth(async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `account:delete-request:tenant:${session.tenantId}`, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  if (!['owner', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Você não tem permissão para executar esta ação.', code: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  const confirmation = String(body.confirmation || '').trim();
  if (confirmation !== 'EXCLUIR') {
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'account', entityId: session.tenantId, action: 'account.deletion_request.failed', metadata: { reason: 'confirmation_mismatch' } });
    return NextResponse.json({ error: 'Confirmação inválida. Digite EXCLUIR para confirmar.', code: 'CONFIRMATION_REQUIRED' }, { status: 400 });
  }

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'account', entityId: session.tenantId, action: 'account.deletion_requested', metadata: { reason: reason || null } });
  return NextResponse.json({ ok: true, message: 'Solicitação de exclusão registrada. Nossa equipe revisará a solicitação.' });
});

import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';

const REQUEST_ACTIONS = ['account.export.requested', 'account.deletion_requested'] as const;
const STATUS_ACTIONS = [
  'account.delete_request_status_changed',
  'admin.lgpd_request_reviewed',
  'admin.lgpd_request_processed',
  'admin.lgpd_request_rejected',
] as const;

type LgpdStatus = 'pending' | 'in_review' | 'processed' | 'rejected' | 'cancelled';

export const GET = withPlatformAdmin(async (req, session) => {
  const rl = rateLimit({ key: `admin:lgpd:get:${session.userId}:ip:${getClientIp(req)}`, limit: 120, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const requestLogs = await prisma.auditLog.findMany({
    where: { action: { in: REQUEST_ACTIONS as any } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { tenant: { select: { id: true, name: true, slug: true } }, user: { select: { id: true, email: true, name: true } } },
  });

  const statusLogs = await prisma.auditLog.findMany({
    where: { action: { in: STATUS_ACTIONS as any } },
    orderBy: { createdAt: 'desc' },
    take: 400,
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const statusByRequest = new Map<string, { status: LgpdStatus; note?: string | null; at: Date; by?: { id: string; email: string; name: string } | null }>();
  for (const log of statusLogs) {
    const requestId = String((log.metadata as any)?.requestId || '');
    if (!requestId || statusByRequest.has(requestId)) continue;
    statusByRequest.set(requestId, {
      status: ((log.metadata as any)?.status || 'pending') as LgpdStatus,
      note: (log.metadata as any)?.note || null,
      at: log.createdAt,
      by: log.user ? { id: log.user.id, email: log.user.email, name: log.user.name } : null,
    });
  }

  const requests = requestLogs.map((log) => {
    const type = log.action === 'account.export.requested' ? 'export' : 'delete';
    const statusInfo = statusByRequest.get(log.id);
    return {
      id: log.id,
      type,
      status: statusInfo?.status || 'pending',
      requestedAt: log.createdAt,
      requester: log.user ? { id: log.user.id, email: log.user.email, name: log.user.name } : null,
      tenant: log.tenant ? { id: log.tenant.id, name: log.tenant.name, slug: log.tenant.slug } : null,
      reason: (log.metadata as any)?.reason || null,
      note: statusInfo?.note || null,
      reviewedAt: statusInfo?.at || null,
      reviewedBy: statusInfo?.by || null,
    };
  });

  return NextResponse.json({ requests });
});

export const PATCH = withPlatformAdmin(async (req, session) => {
  const rl = rateLimit({ key: `admin:lgpd:patch:${session.userId}:ip:${getClientIp(req)}`, limit: 30, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => ({} as any));
  const requestId = String(body.requestId || '');
  const status = String(body.status || '') as LgpdStatus;
  const note = String(body.note || '').trim() || null;
  if (!requestId || !['pending', 'in_review', 'processed', 'rejected', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Dados inválidos.', code: 'INVALID_INPUT' }, { status: 400 });
  }

  const requestLog = await prisma.auditLog.findUnique({ where: { id: requestId }, select: { id: true, tenantId: true, action: true, userId: true } });
  if (!requestLog || !REQUEST_ACTIONS.includes(requestLog.action as any)) {
    return NextResponse.json({ error: 'Solicitação LGPD não encontrada.', code: 'REQUEST_NOT_FOUND' }, { status: 404 });
  }

  await logPlatformAudit({
    tenantId: requestLog.tenantId,
    userId: session.userId,
    entityType: 'account',
    entityId: requestId,
    action: status === 'processed' ? 'admin.lgpd_request_processed' : status === 'rejected' ? 'admin.lgpd_request_rejected' : 'admin.lgpd_request_reviewed',
    metadata: { requestId, status, note, requestAction: requestLog.action, requesterUserId: requestLog.userId },
  });

  await logPlatformAudit({
    tenantId: requestLog.tenantId,
    userId: session.userId,
    entityType: 'account',
    entityId: requestId,
    action: 'account.delete_request_status_changed',
    metadata: { requestId, status, note },
  });

  return NextResponse.json({ ok: true, requestId, status });
});

import { NextResponse, type NextRequest } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

/**
 * Repair only a MISSING AllowedUser for an existing, active owner membership.
 * A blocked/revoked AllowedUser must be reviewed separately, never reactivated.
 * Does not create users, change passwords, change roles, or alter plan status.
 */
export const POST = withPlatformAdmin(async (
  req: NextRequest,
  session,
  ctx: { params: { id: string; tenantUserId: string } },
) => {
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  try {
    if (!origin || new URL(origin).origin !== new URL(req.url).origin
      || (site && site !== 'same-origin')) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500 || Object.keys(body ?? {}).length !== 1) {
    return NextResponse.json({ error: 'Informe como confirmou a identidade (10 a 500 caracteres).' }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const member = await tx.tenantUser.findFirst({
        where: { id: ctx.params.tenantUserId, tenantId: ctx.params.id, status: 'active', role: 'owner' },
        select: {
          userId: true, user: { select: { email: true, globalRole: true } },
          tenant: { select: { status: true } },
        },
      });
      if (!member || BLOCKED.has(String(member.tenant.status)) || member.user.globalRole === 'platform_admin') {
        return { status: 404 as const };
      }
      const email = member.user.email.trim().toLowerCase();
      // Explicitly refuse to revive any previously blocked or revoked login access.
      const existing = await tx.allowedUser.findFirst({
        where: { tenantId: ctx.params.id, email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) return { status: 409 as const };

      const access = await tx.allowedUser.create({
        data: {
          tenantId: ctx.params.id, email, role: 'owner', active: true, status: 'active',
          source: 'platform_owner_access_reconciliation', acceptedAt: new Date(), invitedBy: session.userId,
        },
      });
      // Audit is in the SAME transaction: rollback access if the audit insert fails.
      await tx.auditLog.create({
        data: {
          tenantId: ctx.params.id, userId: session.userId, entityType: 'allowed_user',
          entityId: access.id, action: 'platform.owner_login_access_reconciled',
          metadata: { reason, targetUserId: member.userId, ownerMembershipVerified: true },
        },
      });
      return { status: 200 as const };
    });
    if (result.status === 404) return NextResponse.json({ error: 'Proprietário ativo não encontrado.' }, { status: 404 });
    if (result.status === 409) return NextResponse.json({
      error: 'Já existe um acesso para esta empresa. Se estiver bloqueado, revise-o separadamente.',
    }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível regularizar o acesso.' }, { status: 503 });
  }
});

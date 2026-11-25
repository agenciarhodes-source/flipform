import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { mayProvisionDeveloperMembership, shouldDeactivateDeveloperCreatedAllowlist } from '@/lib/developer-access/security-rules';
import { logPlatformAudit } from '@/lib/platform-audit';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const id = z.string().guid();
const bodySchema = z.object({ tenantId: id, userId: id }).strict();

function hasRecentMfa(session: { mfaVerifiedAt?: number }) {
  const t = session.mfaVerifiedAt;
  return typeof t === 'number' && Number.isSafeInteger(t)
    && t <= Date.now() / 1000 + 60 && Date.now() / 1000 - t <= 15 * 60;
}
function originValid(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin
    && (!req.headers.get('sec-fetch-site') || req.headers.get('sec-fetch-site') === 'same-origin');
}
async function preflight(req: NextRequest, session: { userId: string; mfaVerifiedAt?: number }) {
  if (!originValid(req) || !hasRecentMfa(session))
    return NextResponse.json({ error: 'É necessário login recente com MFA para conceder acesso técnico.' }, { status: 403 });
  const limit = await rateLimit({ key: 'developer-grants:' + session.userId + ':' + getClientIp(req), limit: 10, windowMs: 10 * 60_000 });
  return limit.allowed ? null : rateLimitResponse(limit);
}

/** Grant existing users only; NEVER reset or request a client's password. */
export const POST = withPlatformAdmin(async (req, session) => {
  const denied = await preflight(req, session);
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
  const { userId, tenantId } = parsed.data;
  if (session.userId === userId) return NextResponse.json({ error: 'Use uma conta técnica separada da administração global.' }, { status: 409 });
  const result = await prisma.$transaction(async tx => {
    const [user, tenant] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, mfaEnabledAt: true, globalRole: true } }),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, status: true } }),
    ]);
    if (!tenant || ['suspended', 'blocked', 'canceled', 'inactive'].includes(tenant.status)) return { status: 404 };
    if (!user || user.globalRole === 'platform_admin') return { status: 409 };
    const existing = await tx.developerTenantGrant.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    if (existing && !existing.revokedAt) return { status: 409 };
    // A technical grant must never reinstate a previously disabled company account.
    // Provision only genuinely missing records, preserving any existing company role.
    const existingMembership = await tx.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true, role: true },
    });
    const existingAllowlist = await tx.allowedUser.findUnique({
      where: { tenantId_email: { tenantId, email: user.email } },
      select: { active: true, status: true },
    });
    if (!mayProvisionDeveloperMembership({ existingMembership, existingAllowlist })) return { status: 409 };
    if (!existingMembership) {
      await tx.tenantUser.create({ data: { tenantId, userId, role: 'viewer', status: 'active' } });
    }
    if (!existingAllowlist) {
      await tx.allowedUser.create({ data: {
        tenantId, email: user.email, role: existingMembership?.role ?? 'viewer',
        status: 'active', active: true, source: 'developer_grant', invitedBy: session.userId,
      } });
    }
    const grant = await tx.developerTenantGrant.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, grantedById: session.userId },
      update: { revokedAt: null, grantedById: session.userId },
    });
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    return { status: 201, id: grant.id };
  });
  if (result.status !== 201) return NextResponse.json({ error: 'Empresa ou usuário não elegível, vínculo empresarial desativado ou acesso já concedido.' }, { status: result.status });
  await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'developer_grant', entityId: result.id!,
    action: 'developer.granted', metadata: { targetUserId: userId } });
  return NextResponse.json({ ok: true, grantId: result.id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

export const DELETE = withPlatformAdmin(async (req, session) => {
  const denied = await preflight(req, session);
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
  const { tenantId, userId } = parsed.data;
  const grant = await prisma.$transaction(async tx => {
    const current = await tx.developerTenantGrant.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    if (!current || current.revokedAt) return null;
    await tx.developerTenantGrant.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    // Never leave login access behind when it was provisioned solely by this
    // developer grant. Existing customer-issued allowlist entries remain intact.
    const account = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (account?.email) {
      const allowlist = await tx.allowedUser.findUnique({
        where: { tenantId_email: { tenantId, email: account.email } },
        select: { source: true },
      });
      if (shouldDeactivateDeveloperCreatedAllowlist(allowlist?.source)) {
        await tx.allowedUser.update({
          where: { tenantId_email: { tenantId, email: account.email } },
          data: { active: false, status: 'inactive' },
        });
      }
    }
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    return current.id;
  });
  if (!grant) return NextResponse.json({ error: 'Acesso técnico ativo não encontrado.' }, { status: 404 });
  await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'developer_grant', entityId: grant,
    action: 'developer.revoked', metadata: { targetUserId: userId } });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});

/** Safe account/tenant catalog for the platform administrator's access screen. */
export const GET = withPlatformAdmin(async (_req, session) => {
  if (!hasRecentMfa(session))
    return NextResponse.json({ error: 'Confirme o MFA novamente para administrar concessões.' }, { status: 403 });
  const [tenants, users, grants] = await Promise.all([
    prisma.tenant.findMany({
      where: { status: { in: ['active', 'trial'] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' }, take: 200,
    }),
    prisma.user.findMany({
      // Nullable globalRole: SQL NOT (global_role = ...) excludes NULL rows.
      // Include ordinary accounts explicitly while excluding platform admins.
      where: { OR: [{ globalRole: null }, { globalRole: { not: 'platform_admin' } }] },
      select: { id: true, email: true, name: true, mfaEnabledAt: true },
      orderBy: { email: 'asc' }, take: 200,
    }),
    prisma.developerTenantGrant.findMany({
      select: { id: true, tenantId: true, userId: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' }, take: 300,
    }),
  ]);
  return NextResponse.json({ tenants, users, grants }, { headers: { 'Cache-Control': 'private, no-store' } });
});

import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);
const LOGIN_ALLOWED_STATUSES = ['active', 'accepted', 'pending'];
const PREFERRED_ALLOWED_STATUSES = new Set(['active', 'accepted']);

function logLogin(event: string, metadata: Record<string, unknown>) {
  console.info('[auth/login][POST]', { event, ...metadata });
}

function tenantBlockedResponse(status: unknown) {
  return NextResponse.json(
    {
      error: 'Acesso bloqueado para esta empresa. Entre em contato com o administrador.',
      code: 'tenant_blocked',
      status,
    },
    { status: 403 },
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const bodyForRate = await req.clone().json().catch(() => ({} as any));
  const emailForRate = String(bodyForRate?.email || '').trim().toLowerCase();
  const rlIp = rateLimit({ key: `login:ip:${ip}`, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rlIp.allowed) return rateLimitResponse(rlIp);
  if (emailForRate) { const rlEmail = rateLimit({ key: `login:email:${emailForRate}`, limit: 5, windowMs: 10 * 60 * 1000 }); if (!rlEmail.allowed) return rateLimitResponse(rlEmail); }

  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      logLogin('validation_failed', { ip, issues: parsed.error.errors.map((issue) => issue.message) });
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      logLogin('invalid_credentials', { ip, email: normalizedEmail, reason: 'user_not_found' });
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      logLogin('invalid_credentials', { ip, email: normalizedEmail, userId: user.id, reason: 'password_mismatch' });
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    // Platform admin: pode logar sem tenant e sem AllowedUser.
    if (user.globalRole === 'platform_admin') {
      await setSessionCookie({
        userId: user.id,
        tenantId: '',
        role: 'platform_admin',
        email: user.email,
        name: user.name,
        tenantSlug: '',
        globalRole: 'platform_admin',
      });
      logLogin('platform_admin_success', { ip, email: normalizedEmail, userId: user.id });
      return NextResponse.json({ ok: true, platformAdmin: true });
    }

    const memberships = await prisma.tenantUser.findMany({
      where: { userId: user.id, status: 'active' },
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
    });
    const membershipTenantIds = memberships.map((membership) => membership.tenantId);

    const allowedUsers = membershipTenantIds.length > 0
      ? await prisma.allowedUser.findMany({
        where: {
          email: normalizedEmail,
          active: true,
          status: { in: LOGIN_ALLOWED_STATUSES },
          tenantId: { in: membershipTenantIds },
        },
      })
      : [];

    const allowedByTenant = new Map(allowedUsers.map((allowed) => [allowed.tenantId, allowed]));
    const membershipsWithAllowed = memberships.filter((membership) => allowedByTenant.has(membership.tenantId));

    if (membershipsWithAllowed.length === 0) {
      const hasAnyActiveAllowedUser = await prisma.allowedUser.findFirst({
        where: {
          email: normalizedEmail,
          active: true,
          status: { in: LOGIN_ALLOWED_STATUSES },
        },
        select: { id: true },
      });

      if (!hasAnyActiveAllowedUser) {
        logLogin('forbidden_no_allowed_user', { ip, email: normalizedEmail, userId: user.id, memberships: memberships.length });
        return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
      }

      logLogin('forbidden_no_matching_tenant_user', { ip, email: normalizedEmail, userId: user.id, memberships: memberships.length });
      return NextResponse.json({ error: 'Este e-mail não possui uma empresa ativa associada.' }, { status: 403 });
    }

    const preferredMembership = membershipsWithAllowed.find((membership) => {
      const allowed = allowedByTenant.get(membership.tenantId);
      return allowed && PREFERRED_ALLOWED_STATUSES.has(allowed.status) && !BLOCKED.has(String(membership.tenant.status));
    });
    const fallbackMembership = membershipsWithAllowed.find((membership) => !BLOCKED.has(String(membership.tenant.status)));
    const selectedMembership = preferredMembership ?? fallbackMembership;

    if (!selectedMembership) {
      const blockedMembership = membershipsWithAllowed[0];
      logLogin('forbidden_tenant_blocked', {
        ip,
        email: normalizedEmail,
        userId: user.id,
        tenantId: blockedMembership.tenantId,
        tenantStatus: blockedMembership.tenant.status,
      });
      return tenantBlockedResponse(blockedMembership.tenant.status);
    }

    const selectedAllowedUser = allowedByTenant.get(selectedMembership.tenantId);
    if (!selectedAllowedUser) {
      // Defesa adicional: a seleção acima só deve ocorrer quando há AllowedUser correspondente.
      logLogin('forbidden_missing_allowed_after_selection', { ip, email: normalizedEmail, userId: user.id, tenantId: selectedMembership.tenantId });
      return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
    }

    await setSessionCookie({
      userId: user.id,
      tenantId: selectedMembership.tenantId,
      role: selectedMembership.role,
      email: user.email,
      name: user.name,
      tenantSlug: selectedMembership.tenant.slug,
      globalRole: null,
    });

    // Atualiza lastLoginAt do tenant selecionado.
    await prisma.tenant.update({ where: { id: selectedMembership.tenantId }, data: { lastLoginAt: new Date() } });

    try {
      await logAudit({
        tenantId: selectedMembership.tenantId, userId: user.id,
        entityType: 'session', entityId: user.id, action: 'auth.login',
        metadata: { email: user.email, role: selectedMembership.role, allowedUserId: selectedAllowedUser.id },
      });
    } catch (auditError) {
      console.error('[auth/login][POST]', {
        event: 'audit_failed',
        email: normalizedEmail,
        userId: user.id,
        tenantId: selectedMembership.tenantId,
        error: auditError,
      });
    }

    logLogin('success', { ip, email: normalizedEmail, userId: user.id, tenantId: selectedMembership.tenantId, role: selectedMembership.role });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[auth/login][POST]', { event: 'error', error: e });
    return NextResponse.json({ error: 'Erro no login' }, { status: 500 });
  }
}

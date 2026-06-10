import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

function logLogin(event: string, metadata: Record<string, unknown>) {
  console.info('[auth/login][POST]', { event, ...metadata });
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

    if (memberships.length === 0) {
      logLogin('forbidden_no_active_membership', { ip, email: normalizedEmail, userId: user.id });
      return NextResponse.json({ error: 'Sem empresa associada ou conta inativa' }, { status: 403 });
    }

    type MembershipRow = { tenantId: string; role: string; tenant: { slug: string; status: unknown }; [key: string]: unknown };
    type AllowedRow = { tenantId: string; id: string; [key: string]: unknown };
    const typedMemberships = memberships as MembershipRow[];

    const allowedUsers = await prisma.allowedUser.findMany({
      where: {
        email: normalizedEmail,
        active: true,
        status: 'active',
        tenantId: { in: typedMemberships.map((m) => m.tenantId) },
      },
    });

    const allowedByTenant = new Map<string, AllowedRow>((allowedUsers as AllowedRow[]).map((allowed) => [allowed.tenantId, allowed]));
    const selectedMembership = typedMemberships.find((membership) => {
      const allowed = allowedByTenant.get(membership.tenantId);
      return allowed && !BLOCKED.has(String(membership.tenant.status));
    });

    if (!selectedMembership) {
      logLogin('forbidden_no_active_allowed_tenant', {
        ip,
        email: normalizedEmail,
        userId: user.id,
        memberships: memberships.length,
        allowedUsers: allowedUsers.length,
      });
      return NextResponse.json({ error: 'Este e-mail não possui uma empresa ativa associada.' }, { status: 403 });
    }

    const selectedAllowedUser = allowedByTenant.get(selectedMembership.tenantId);

    await setSessionCookie({
      userId: user.id,
      tenantId: selectedMembership.tenantId,
      role: selectedMembership.role,
      email: user.email,
      name: user.name,
      tenantSlug: selectedMembership.tenant.slug,
      globalRole: null,
    });

    await prisma.tenant.update({ where: { id: selectedMembership.tenantId }, data: { lastLoginAt: new Date() } });

    try {
      await logAudit({
        tenantId: selectedMembership.tenantId, userId: user.id,
        entityType: 'session', entityId: user.id, action: 'auth.login',
        metadata: { email: user.email, role: selectedMembership.role, allowedUserId: (selectedAllowedUser as AllowedRow | undefined)?.id },
      });
    } catch (auditError) {
      const err = auditError as { message?: string; code?: string; meta?: unknown; stack?: string };
      console.error('[auth/login][POST][audit]', {
        message: err?.message,
        code: err?.code,
        meta: err?.meta,
        stack: err?.stack,
      });
    }

    logLogin('success', { ip, email: normalizedEmail, userId: user.id, tenantId: selectedMembership.tenantId, role: selectedMembership.role });
    return NextResponse.json({ ok: true, platformAdmin: false });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string };
    console.error('[auth/login][POST]', {
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
      stack: err?.stack,
    });
    return NextResponse.json({ error: 'Erro no login' }, { status: 500 });
  }
}

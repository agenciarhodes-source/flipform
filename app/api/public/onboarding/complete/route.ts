import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyOnboardingToken } from '@/lib/jwt';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';
import { evaluateBillingAccess } from '@/lib/billing-access';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `public-onboarding:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => ({} as any));
  const token = String(body?.token || '');
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');

  if (!token || !name || password.length < 8) return NextResponse.json({ error: 'Dados inválidos.', code: 'INVALID_INPUT' }, { status: 400 });

  const payload = verifyOnboardingToken(token);
  if (!payload || payload.purpose !== 'onboarding') {
    return NextResponse.json({ error: 'Link de onboarding inválido ou expirado.', code: 'INVALID_ONBOARDING_TOKEN' }, { status: 400 });
  }

  const allowed = await prisma.allowedUser.findFirst({ where: { email: payload.email, tenantId: payload.tenantId } });
  if (!allowed) return NextResponse.json({ error: 'Link de onboarding inválido ou expirado.', code: 'INVALID_ONBOARDING_TOKEN' }, { status: 400 });

  await logPlatformAudit({ tenantId: payload.tenantId, userId: null, entityType: 'onboarding', entityId: payload.email, action: 'onboarding.started' });

  let user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user) {
    const passwordHash = await hashPassword(password);
    user = await prisma.user.create({ data: { email: payload.email, name, passwordHash } });
    await logPlatformAudit({ tenantId: payload.tenantId, userId: user.id, entityType: 'onboarding', entityId: user.id, action: 'onboarding.owner_created' });
  } else {
    if (!user.passwordHash) {
      const passwordHash = await hashPassword(password);
      user = await prisma.user.update({ where: { id: user.id }, data: { name, passwordHash } });
    }
  }

  const existingOwner = await prisma.tenantUser.findFirst({ where: { tenantId: payload.tenantId, userId: user.id } });
  if (!existingOwner) {
    await prisma.tenantUser.create({ data: { tenantId: payload.tenantId, userId: user.id, role: 'owner', status: 'active' } });
  }

  await prisma.allowedUser.updateMany({ where: { id: allowed.id }, data: { active: true, status: 'active', acceptedAt: new Date() } });
  await logPlatformAudit({ tenantId: payload.tenantId, userId: user.id, entityType: 'onboarding', entityId: user.id, action: 'onboarding.password_defined' });

  const tenant = await prisma.tenant.findUnique({ where: { id: payload.tenantId }, select: { slug: true, status: true } });
  const sub = await prisma.subscription.findFirst({ where: { tenantId: payload.tenantId }, orderBy: { createdAt: 'desc' }, select: { status: true, gracePeriodEndsAt: true } });

  const access = evaluateBillingAccess({ tenantStatus: tenant?.status, subscriptionStatus: sub?.status, gracePeriodEndsAt: sub?.gracePeriodEndsAt || null });

  await setSessionCookie({ userId: user.id, tenantId: payload.tenantId, role: 'owner', email: user.email, name: user.name, tenantSlug: tenant?.slug || '', globalRole: null });

  if (!access.allowAccess) {
    await logPlatformAudit({ tenantId: payload.tenantId, userId: user.id, entityType: 'onboarding', entityId: user.id, action: 'onboarding.pending_payment' });
    return NextResponse.json({ ok: true, pendingPayment: true, nextUrl: '/checkout/pending' });
  }

  await logPlatformAudit({ tenantId: payload.tenantId, userId: user.id, entityType: 'onboarding', entityId: user.id, action: 'onboarding.completed' });
  return NextResponse.json({ ok: true, pendingPayment: false, nextUrl: '/dashboard' });
}

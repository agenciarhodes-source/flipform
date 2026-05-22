import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { verifyCodeSchema } from '@/lib/schemas';
import { hashOtp } from '@/lib/otp';
import { signOnboardingToken } from '@/lib/jwt';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const bodyForRate = await req.clone().json().catch(() => ({} as any));
  const emailForRate = String(bodyForRate?.email || '').toLowerCase();
  const rlIp = rateLimit({ key: `otp:verify:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rlIp.allowed) return rateLimitResponse(rlIp);
  if (emailForRate) { const rlEmail = rateLimit({ key: `otp:verify:email:${emailForRate}`, limit: 5, windowMs: 15 * 60 * 1000 }); if (!rlEmail.allowed) return rateLimitResponse(rlEmail); }

  const body = await req.json().catch(() => ({}));
  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();

  const rec = await prisma.emailVerificationCode.findFirst({ where: { email, purpose: 'onboarding' }, orderBy: { createdAt: 'desc' } });
  if (!rec || rec.usedAt) return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
  if (rec.expiresAt.getTime() < Date.now()) {
    await logAudit({ tenantId: 'unknown', entityType: 'auth', entityId: email, action: 'auth.otp_expired' });
    return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
  }
  if (rec.attempts >= rec.maxAttempts) return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });

  const ok = hashOtp(email, parsed.data.code) === rec.codeHash;
  if (!ok) {
    await prisma.emailVerificationCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    await logAudit({ tenantId: 'unknown', entityType: 'auth', entityId: email, action: 'auth.otp_failed' });
    return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
  }

  await prisma.emailVerificationCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  const allowed = await prisma.allowedUser.findFirst({ where: { email, active: true }, select: { tenantId: true } });
  if (!allowed?.tenantId) return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
  const onboardingToken = signOnboardingToken({ email, tenantId: allowed.tenantId, purpose: 'onboarding' });

  await logAudit({ tenantId: 'unknown', entityType: 'auth', entityId: email, action: 'auth.otp_verified' });

  return NextResponse.json({ ok: true, onboardingToken });
}

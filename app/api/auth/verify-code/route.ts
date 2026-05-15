import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCodeSchema } from '@/lib/schemas';
import { hashOtp } from '@/lib/otp';
import { signOnboardingToken } from '@/lib/jwt';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
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
  const onboardingToken = signOnboardingToken({ email, purpose: 'onboarding' });

  await logAudit({ tenantId: 'unknown', entityType: 'auth', entityId: email, action: 'auth.otp_verified' });

  return NextResponse.json({ ok: true, onboardingToken });
}

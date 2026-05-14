import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requestCodeSchema } from '@/lib/schemas';
import { generateOtpCode, hashOtp } from '@/lib/otp';
import { logAudit } from '@/lib/audit';
import { sendOtpEmail } from '@/lib/email';

const GENERIC = 'Se o e-mail estiver autorizado, enviaremos um código de acesso.';
const OK_TENANT = new Set(['active', 'trial', 'past_due']);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = requestCodeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: GENERIC });
  const email = parsed.data.email.trim().toLowerCase();

  const allowed = await prisma.allowedUser.findFirst({ where: { email, active: true }, include: { tenant: true } });
  if (!allowed || !OK_TENANT.has(String(allowed.tenant.status))) return NextResponse.json({ message: GENERIC });

  await prisma.emailVerificationCode.updateMany({
    where: { email, purpose: 'onboarding', usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateOtpCode();
  const codeHash = hashOtp(email, code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.emailVerificationCode.create({
    data: { email, codeHash, purpose: 'onboarding', expiresAt, maxAttempts: 5 },
  });

  await logAudit({ tenantId: allowed.tenantId, entityType: 'auth', entityId: email, action: 'auth.otp_requested', metadata: { email } });

  try {
    await sendOtpEmail({ to: email, code });
    await logAudit({ tenantId: allowed.tenantId, entityType: 'auth', entityId: email, action: 'auth.otp_email_sent' });
  } catch {
    await logAudit({ tenantId: allowed.tenantId, entityType: 'auth', entityId: email, action: 'auth.otp_email_failed' });
    return NextResponse.json({ error: 'Não foi possível enviar o código agora. Tente novamente em instantes.' }, { status: 503 });
  }

  return NextResponse.json({ message: GENERIC });
}

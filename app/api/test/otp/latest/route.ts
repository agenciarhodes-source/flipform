import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'test') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const rec = await prisma.emailVerificationCode.findFirst({ where: { email, purpose: 'onboarding' }, orderBy: { createdAt: 'desc' } });
  if (!rec) return NextResponse.json({ error: 'otp not found' }, { status: 404 });

  // test helper intentionally does not expose plaintext code; tests should inject deterministic OTP via mocked sender.
  return NextResponse.json({ id: rec.id, attempts: rec.attempts, expiresAt: rec.expiresAt, usedAt: rec.usedAt });
}

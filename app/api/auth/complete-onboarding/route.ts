import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { completeOnboardingSchema } from '@/lib/schemas';
import { verifyOnboardingToken } from '@/lib/jwt';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = completeOnboardingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const { onboardingToken, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) return NextResponse.json({ error: 'As senhas não conferem' }, { status: 400 });

  const token = verifyOnboardingToken(onboardingToken);
  if (!token || token.purpose !== 'onboarding') return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

  const allowed = await prisma.allowedUser.findFirst({ where: { email: token.email, active: true }, include: { tenant: true } });
  if (!allowed) return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: token.email },
    update: { passwordHash },
    create: { email: token.email, name: token.email.split('@')[0], passwordHash },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: allowed.tenantId, userId: user.id } },
    update: { role: (allowed.role as any), status: 'active' },
    create: { tenantId: allowed.tenantId, userId: user.id, role: (allowed.role as any), status: 'active' },
  });

  await setSessionCookie({ userId: user.id, tenantId: allowed.tenantId, role: allowed.role, email: user.email, name: user.name, tenantSlug: allowed.tenant.slug });
  await logAudit({ tenantId: allowed.tenantId, userId: user.id, entityType: 'auth', entityId: user.id, action: 'auth.onboarding_completed' });

  return NextResponse.json({ ok: true });
}

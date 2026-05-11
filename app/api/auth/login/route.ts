import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });

    const tu = await prisma.tenantUser.findFirst({
      where: { userId: user.id, status: 'active' },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!tu) return NextResponse.json({ error: 'Sem empresa associada ou conta inativa' }, { status: 403 });

    await setSessionCookie({
      userId: user.id,
      tenantId: tu.tenantId,
      role: tu.role,
      email: user.email,
      name: user.name,
      tenantSlug: tu.tenant.slug,
    });

    await logAudit({
      tenantId: tu.tenantId, userId: user.id,
      entityType: 'session', entityId: user.id, action: 'auth.login',
      metadata: { email: user.email, role: tu.role },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('login error', e);
    return NextResponse.json({ error: 'Erro no login' }, { status: 500 });
  }
}

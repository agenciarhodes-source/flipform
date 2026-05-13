import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

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

    if (user.globalRole !== 'platform_admin') {
      const allowed = await prisma.allowedUser.findFirst({ where: { email, status: 'active' } });
      if (!allowed) {
        return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
      }
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });

    // Platform admin: pode logar sem tenant
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
      // Não há tenant para logar audit nessa fase — registra em audit do primeiro tenant se existir,
      // ou apenas console (poderíamos ter audit global; por ora omitimos).
      return NextResponse.json({ ok: true, platformAdmin: true });
    }

    const tu = await prisma.tenantUser.findFirst({
      where: { userId: user.id, status: 'active' },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!tu) return NextResponse.json({ error: 'Sem empresa associada ou conta inativa' }, { status: 403 });

    const allowedTenant = await prisma.allowedUser.findFirst({
      where: { email, tenantId: tu.tenantId, status: 'active' },
    });
    if (!allowedTenant) {
      return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
    }

    if (BLOCKED.has(String(tu.tenant.status))) {
      return NextResponse.json(
        {
          error: 'Acesso bloqueado para esta empresa. Entre em contato com o administrador.',
          code: 'tenant_blocked',
          status: tu.tenant.status,
        },
        { status: 403 },
      );
    }

    await setSessionCookie({
      userId: user.id,
      tenantId: tu.tenantId,
      role: tu.role,
      email: user.email,
      name: user.name,
      tenantSlug: tu.tenant.slug,
      globalRole: user.globalRole || null,
    });

    // Atualiza lastLoginAt do tenant
    await prisma.tenant.update({ where: { id: tu.tenantId }, data: { lastLoginAt: new Date() } });

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

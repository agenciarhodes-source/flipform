import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSessionCookie } from '@/lib/auth';
import { registerSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { email } = parsed.data;

    const allowed = await prisma.allowedUser.findFirst({
      where: { email, active: true },
      include: { tenant: { select: { id: true, slug: true } } },
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
    }

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { userId: existingUser.id, tenantId: allowed.tenantId, status: 'active' },
    });
    if (!tenantUser) {
      return NextResponse.json({ error: 'Este e-mail não possui acesso autorizado.' }, { status: 403 });
    }

    await setSessionCookie({
      userId: existingUser.id,
      tenantId: allowed.tenantId,
      role: tenantUser.role,
      email: existingUser.email,
      name: existingUser.name,
      tenantSlug: allowed.tenant.slug,
      globalRole: existingUser.globalRole || null,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('register error', e);
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 });
  }
}

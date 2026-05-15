import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

async function canManageAllowlist() {
  const session = await getSession();
  if (!session) return null;
  if (session.globalRole === 'platform_admin') return session;
  if (session.role === 'owner' || session.role === 'admin') return session;
  return null;
}

export async function GET() {
  const session = await canManageAllowlist();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

  const where = session.globalRole === 'platform_admin' ? {} : { tenantId: session.tenantId };
  const items = await prisma.allowedUser.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await canManageAllowlist();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  const body = await req.json();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'agent');
  const tenantId = session.globalRole === 'platform_admin' ? String(body.tenantId || '') : session.tenantId;
  if (!email || !tenantId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const exists = await prisma.allowedUser.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: 'E-mail já autorizado' }, { status: 409 });

  const created = await prisma.allowedUser.create({
    data: {
      email,
      tenantId,
      role,
      active: true,
      invitedBy: session.userId,
    },
  });

  return NextResponse.json({ ok: true, item: created });
}

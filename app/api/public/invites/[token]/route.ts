import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, ctx: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({
    where: { token: ctx.params.token },
    include: { tenant: { select: { name: true, slug: true, primaryColor: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Convite não está mais ativo', status: invite.status }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Convite expirado' }, { status: 410 });
  }
  return NextResponse.json({
    invite: { email: invite.email, role: invite.role, tenant: invite.tenant, expiresAt: invite.expiresAt },
  });
}

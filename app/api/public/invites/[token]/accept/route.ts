import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { inviteAcceptSchema } from '@/lib/schemas-users';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request, ctx: { params: { token: string } }) {
  try {
    const body = await req.json();
    const parsed = inviteAcceptSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const invite = await prisma.invite.findUnique({
      where: { token: ctx.params.token },
      include: { tenant: true },
    });
    if (!invite) return NextResponse.json({ error: 'Convite inválido' }, { status: 404 });
    if (invite.status !== 'pending') return NextResponse.json({ error: 'Convite não está ativo' }, { status: 410 });
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Convite expirado' }, { status: 410 });

    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    let user = existing;
    if (!user) {
      const passwordHash = await hashPassword(parsed.data.password);
      user = await prisma.user.create({ data: { name: parsed.data.name, email: invite.email, passwordHash } });
    }

    // Já vinculado?
    const alreadyMember = await prisma.tenantUser.findFirst({ where: { tenantId: invite.tenantId, userId: user.id } });
    if (!alreadyMember) {
      await prisma.tenantUser.create({
        data: { tenantId: invite.tenantId, userId: user.id, role: invite.role, status: 'active' },
      });
    }

    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    await logAudit({
      tenantId: invite.tenantId, userId: user.id,
      entityType: 'invite', entityId: invite.id, action: 'invite.accepted',
      metadata: { email: invite.email, role: invite.role },
    });

    await setSessionCookie({
      userId: user.id, tenantId: invite.tenantId, role: invite.role,
      email: user.email, name: user.name, tenantSlug: invite.tenant.slug,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('invite.accept error', e);
    return NextResponse.json({ error: 'Erro ao aceitar convite' }, { status: 500 });
  }
}

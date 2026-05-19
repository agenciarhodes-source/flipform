import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

    const id = ctx.params.id;
    const current = await prisma.allowedUser.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const nextStatus = body.status !== undefined ? String(body.status) : current.status;
    const nextActive = body.active !== undefined ? Boolean(body.active) : current.active;

    const updated = await prisma.allowedUser.update({ where: { id }, data: { status: nextStatus, active: nextActive } });

    await logPlatformAudit({ tenantId: current.tenantId, userId: session.userId, entityType: 'allowlist', entityId: id, action: 'allowlist.email.updated', metadata: { previous: { status: current.status, active: current.active }, next: { status: nextStatus, active: nextActive } } });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error('[admin/allowed-users/:id][PATCH]', error);
    return NextResponse.json({ error: 'Falha ao atualizar acesso autorizado' }, { status: 500 });
  }
}

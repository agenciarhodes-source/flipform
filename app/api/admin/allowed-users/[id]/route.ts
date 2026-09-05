import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

async function safeAudit(params: Parameters<typeof logPlatformAudit>[0]) {
  try {
    await logPlatformAudit(params);
  } catch (auditError) {
    console.error('[admin.allowed-users][audit]', auditError);
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado', code: 'UNAUTHORIZED' }, { status: 403 });

    const id = String(ctx.params.id || '').trim();
    if (!id) return NextResponse.json({ error: 'ID inválido.', code: 'INVALID_ID' }, { status: 400 });

    const current = await prisma.allowedUser.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Registro não encontrado.', code: 'ALLOWED_USER_NOT_FOUND' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const nextStatus = body.status !== undefined ? String(body.status).trim().toLowerCase() : current.status;
    const nextActive = body.active !== undefined ? Boolean(body.active) : current.active;

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return NextResponse.json({ error: 'Status inválido.', code: 'INVALID_STATUS' }, { status: 400 });
    }

    const updated = await prisma.allowedUser.update({
      where: { id },
      data: { status: nextStatus, active: nextActive },
    });

    await safeAudit({
      tenantId: current.tenantId,
      userId: session.userId,
      entityType: 'allowlist',
      entityId: id,
      action: 'allowlist.email.updated',
      metadata: {
        previous: { status: current.status, active: current.active },
        next: { status: nextStatus, active: nextActive },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error('[admin.allowed-users.PATCH]', {
      step: 'patch-allowed-user',
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Falha ao atualizar acesso autorizado.', code: 'ALLOWED_USER_PATCH_FAILED' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado', code: 'UNAUTHORIZED' }, { status: 403 });

    const id = String(ctx.params.id || '').trim();
    if (!id) return NextResponse.json({ error: 'ID inválido.', code: 'INVALID_ID' }, { status: 400 });

    const current = await prisma.allowedUser.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Registro não encontrado.', code: 'ALLOWED_USER_NOT_FOUND' }, { status: 404 });

    await prisma.allowedUser.delete({ where: { id } });

    await safeAudit({
      tenantId: current.tenantId,
      userId: session.userId,
      entityType: 'allowlist',
      entityId: id,
      action: 'allowlist.email.deleted',
      metadata: {
        email: current.email,
        tenantId: current.tenantId,
        role: current.role,
        status: current.status,
        active: current.active,
        dataDeletion: false,
      },
    });

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error('[admin.allowed-users.DELETE]', {
      step: 'delete-allowed-user',
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Falha ao excluir acesso autorizado.', code: 'ALLOWED_USER_DELETE_FAILED' }, { status: 500 });
  }
}

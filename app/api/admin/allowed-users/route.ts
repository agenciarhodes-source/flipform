import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

function badRequest(error: string, code: string) {
  return NextResponse.json({ error, code, items: [], tenants: [] }, { status: 400 });
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `admin:allowed-users:get:ip:${ip}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado', code: 'UNAUTHORIZED', items: [], tenants: [] }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim().toLowerCase();
    const tenantId = String(searchParams.get('tenantId') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const active = String(searchParams.get('active') || '').trim();

    const where: any = {};
    if (q) where.email = { contains: q, mode: 'insensitive' };
    if (tenantId && tenantId !== 'all') where.tenantId = tenantId;
    if (status && status !== 'all') where.status = status;
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;

    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { name: 'asc' },
    });

    const allowedUsers = await prisma.allowedUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    const items = allowedUsers.map((user) => ({
      ...user,
      tenant: tenantMap.get(user.tenantId) || null,
    }));

    return NextResponse.json({ items, tenants });
  } catch (error) {
    console.error('[admin.allowed-users.GET]', {
      step: 'load-list',
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Falha ao carregar acessos autorizados.', code: 'ALLOWED_USERS_LIST_FAILED', items: [], tenants: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `admin:allowed-users:post:ip:${ip}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado', code: 'UNAUTHORIZED' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const tenantId = String(body.tenantId || '').trim();
    const role = String(body.role || '').trim().toLowerCase();
    const status = String(body.status || 'active').trim().toLowerCase() || 'active';
    const active = body.active === undefined ? true : Boolean(body.active);

    if (!email || !email.includes('@')) return badRequest('E-mail inválido.', 'INVALID_EMAIL');
    if (!tenantId) return badRequest('Tenant é obrigatório.', 'TENANT_REQUIRED');
    if (!ALLOWED_ROLES.has(role)) return badRequest('Role inválida.', 'INVALID_ROLE');
    if (!ALLOWED_STATUSES.has(status)) return badRequest('Status inválido.', 'INVALID_STATUS');

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.', code: 'TENANT_NOT_FOUND' }, { status: 404 });

    const existing = await prisma.allowedUser.findUnique({ where: { email } });

    if (existing && existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Este e-mail já está vinculado a outro tenant.', code: 'EMAIL_ALREADY_LINKED_TO_OTHER_TENANT' }, { status: 409 });
    }

    const item = existing
      ? await prisma.allowedUser.update({
          where: { id: existing.id },
          data: { tenantId, role, status, active, invitedBy: session.userId },
        })
      : await prisma.allowedUser.create({
          data: { email, tenantId, role, status, active, invitedBy: session.userId },
        });

    await logPlatformAudit({
      tenantId,
      userId: session.userId,
      entityType: 'allowlist',
      entityId: item.id,
      action: existing ? 'allowlist.email.updated' : 'allowlist.email.created',
      metadata: { email, role, status, active },
    });

    return NextResponse.json({ ok: true, item });
  } catch (error: any) {
    console.error('[admin.allowed-users.POST]', {
      step: 'upsert-allowed-user',
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Este e-mail já está vinculado a outro tenant.', code: 'EMAIL_ALREADY_LINKED_TO_OTHER_TENANT' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Falha ao salvar acesso autorizado.', code: 'ALLOWED_USER_UPSERT_FAILED' }, { status: 500 });
  }
}

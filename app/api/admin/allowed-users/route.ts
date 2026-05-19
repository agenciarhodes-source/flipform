import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') return null;
  return session;
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `admin:allowed-users:get:ip:${ip}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

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

    const allowedUsers = await prisma.allowedUser.findMany({ where, orderBy: { createdAt: 'desc' } });
    const allTenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true }, orderBy: { name: 'asc' } });
    const tenantById = new Map(allTenants.map((t) => [t.id, t]));

    const items = allowedUsers.map((u) => ({ ...u, tenant: tenantById.get(u.tenantId) || null }));

    return NextResponse.json({ items, tenants: allTenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug })) });
  } catch (error) {
    console.error('[admin/allowed-users][GET]', error);
    return NextResponse.json({ error: 'Falha ao carregar acessos autorizados', details: 'Não foi possível consultar a lista no momento.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `admin:allowed-users:post:ip:${ip}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    const session = await requirePlatformAdmin();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim();
    const tenantId = String(body.tenantId || '').trim();
    const status = String(body.status || 'active').trim() || 'active';
    const active = Boolean(body.active ?? true);

    if (!email) return NextResponse.json({ error: 'E-mail é obrigatório' }, { status: 400 });
    if (!tenantId) return NextResponse.json({ error: 'Tenant é obrigatório' }, { status: 400 });
    if (!role) return NextResponse.json({ error: 'Role é obrigatória' }, { status: 400 });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });

    const exists = await prisma.allowedUser.findUnique({ where: { email } });
    if (exists && exists.tenantId === tenantId) return NextResponse.json({ error: 'E-mail já autorizado para este tenant' }, { status: 409 });
    if (exists) return NextResponse.json({ error: 'E-mail já autorizado em outro tenant' }, { status: 409 });

    const created = await prisma.allowedUser.create({ data: { email, tenantId, role, status, active, invitedBy: session.userId } });
    await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'allowlist', entityId: created.id, action: 'allowlist.email.created', metadata: { email, role, status, active } });

    return NextResponse.json({ ok: true, item: created });
  } catch (error) {
    console.error('[admin/allowed-users][POST]', error);
    return NextResponse.json({ error: 'Falha ao criar acesso autorizado' }, { status: 500 });
  }
}

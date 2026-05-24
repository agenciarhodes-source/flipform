import { getSession } from '@/lib/auth';
import { adminError, adminOk } from '@/lib/api/admin-response';
import { normalizeEmail } from '@/lib/email-normalization';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'agent', 'viewer']);
const ALLOWED_STATUSES = new Set(['pending', 'accepted', 'active', 'blocked', 'revoked', 'expired']);

async function requirePlatformAdmin() { const s = await getSession(); return s?.globalRole === 'platform_admin' ? s : null; }

export async function GET(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:get:ip:${getClientIp(req)}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403);
    const { searchParams } = new URL(req.url);
    const q = normalizeEmail(String(searchParams.get('q') || ''));
    const tenantId = String(searchParams.get('tenantId') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const active = String(searchParams.get('active') || '').trim();
    const where: any = {};
    if (q) where.email = { contains: q, mode: 'insensitive' };
    if (tenantId && tenantId !== 'all') where.tenantId = tenantId;
    if (status && status !== 'all') where.status = status;
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;
    const [tenants, items] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true }, orderBy: { name: 'asc' } }),
      prisma.allowedUser.findMany({ where, orderBy: { createdAt: 'desc' } }),
    ]);
    return adminOk({ items, tenants });
  } catch { return adminError('Falha ao carregar acessos autorizados.', 500); }
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit({ key: `admin:allowed-users:post:ip:${getClientIp(req)}`, limit: 60, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    const session = await requirePlatformAdmin();
    if (!session) return adminError('Não autorizado', 403);
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email || ''));
    const tenantId = String(body.tenantId || '').trim();
    const role = String(body.role || '').trim().toLowerCase();
    const status = String(body.status || 'active').trim().toLowerCase();
    const active = body.active === undefined ? true : Boolean(body.active);
    if (!tenantId) return adminError('Selecione um tenant antes de adicionar o e-mail.', 400);
    if (!email || !email.includes('@')) return adminError('E-mail inválido.', 400);
    if (!ALLOWED_ROLES.has(role)) return adminError('Role inválida.', 400);
    if (!ALLOWED_STATUSES.has(status)) return adminError('Status inválido.', 400);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return adminError('Tenant não encontrado.', 404);
    const item = await prisma.allowedUser.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: { role, status, active, invitedBy: session.userId },
      create: { tenantId, email, role, status, active, invitedBy: session.userId },
    });
    await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'allowlist', entityId: item.id, action: 'allowlist.email.upserted', metadata: { email, role, status, active } });
    return adminOk({ item });
  } catch { return adminError('Falha ao salvar acesso autorizado.', 500); }
}

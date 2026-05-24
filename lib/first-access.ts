import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { buildFirstAccessUrl } from '@/lib/public-urls';

const FIRST_ACCESS_TTL_HOURS = 24;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createFirstAccessToken(params: { email: string; tenantId: string; userId?: string | null }) {
  const email = params.email.trim().toLowerCase();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + FIRST_ACCESS_TTL_HOURS * 60 * 60 * 1000);

  await prisma.firstAccessToken.create({
    data: {
      tokenHash,
      email,
      tenantId: params.tenantId,
      purpose: 'first_access',
      expiresAt,
    },
  });

  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId || null,
    entityType: 'first_access',
    entityId: email,
    action: 'first_access.token_created',
    metadata: { expiresAt },
  });

  return { token, expiresAt, url: buildFirstAccessUrl(token) };
}

export async function hasRecentActiveFirstAccessToken(params: { email: string; tenantId: string }) {
  const email = params.email.trim().toLowerCase();
  const existing = await prisma.firstAccessToken.findFirst({
    where: {
      tenantId: params.tenantId,
      email,
      purpose: 'first_access',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true },
  });
  return existing;
}

export async function resolveFirstAccessToken(token: string) {
  const tokenHash = hashToken(token);
  const rec = await prisma.firstAccessToken.findUnique({ where: { tokenHash } });
  if (!rec || rec.purpose !== 'first_access') return { ok: false as const, code: 'INVALID_FIRST_ACCESS_TOKEN' };
  if (rec.usedAt) return { ok: false as const, code: 'USED_FIRST_ACCESS_TOKEN', used: true };
  if (rec.expiresAt.getTime() < Date.now()) return { ok: false as const, code: 'EXPIRED_FIRST_ACCESS_TOKEN', expired: true };
  return { ok: true as const, rec };
}

export async function markFirstAccessTokenUsed(id: string) {
  await prisma.firstAccessToken.update({ where: { id }, data: { usedAt: new Date() } });
}

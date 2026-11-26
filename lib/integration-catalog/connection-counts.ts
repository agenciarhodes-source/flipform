import 'server-only';
import { prisma } from '@/lib/prisma';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { isInboxOnlyPlan } from '@/lib/billing/inbox-plan-rules';
import { tenantPlanSlug } from '@/lib/session-access';

/** Only stored, non-revoked connection counts; no credentials, writes or provider requests. */
export async function readCatalogConnectionCounts() {
  const empty = { whatsapp: null, instagram: null, meta: null };
  const session = await getVerifiedSession();
  if (!session?.tenantId || !can(session.role, 'INTEGRATIONS_VIEW')) return empty;
  const tenantId = session.tenantId;
  const inboxOnly = session.globalRole !== 'platform_admin' && isInboxOnlyPlan(await tenantPlanSlug(tenantId));
  const whatsapp = await prisma.tenantWhatsAppConnection.count({ where: { tenantId, status: 'connected', revokedAt: null } }).catch(() => null);
  if (inboxOnly) return { ...empty, whatsapp };
  const [instagram, meta] = await Promise.all([
    prisma.tenantInstagramConnection.count({ where: { tenantId, status: 'connected', revokedAt: null } }).catch(() => null),
    prisma.tenantMetaConnection.count({ where: { tenantId, status: 'authorized', revokedAt: null } }).catch(() => null),
  ]);
  return { whatsapp, instagram, meta };
}

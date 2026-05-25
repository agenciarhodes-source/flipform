import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { ensureAdminSchemaReady } from '@/lib/admin/ensure-admin-schema';
import { adminError, adminOk } from '@/lib/api/admin-response';

export const GET = withPlatformAdmin(async () => {
  try {
    await ensureAdminSchemaReady();
    const plans = await prisma.plan.findMany({ orderBy: { price: 'asc' }, include: { _count: { select: { tenants: true, subscriptions: true } } } });
    return adminOk({ plans: plans.map((p) => ({ id: p.id, name: p.name, slug: p.slug, description: p.description, price: Number(p.price), billingCycle: p.billingCycle, maxUsers: p.maxUsers, maxForms: p.maxForms, maxPipelines: p.maxPipelines, maxLeadsPerMonth: p.maxLeadsPerMonth, canUseReports: p.canUseReports, canExportCsv: p.canExportCsv, canUseCustomBranding: p.canUseCustomBranding, canUseMetaPixel: p.canUseMetaPixel, canUseWebhooks: p.canUseWebhooks, canUseTasks: p.canUseTasks, isActive: p.isActive, tenantsCount: p._count.tenants, subscriptionsCount: p._count.subscriptions })) });
  } catch (error) {
    console.error('[admin/plans][GET]', error);
    return adminError('Falha ao carregar planos.', 500);
  }
});

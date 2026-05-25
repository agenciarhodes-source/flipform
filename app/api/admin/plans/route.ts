import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { adminOk, adminError } from '@/lib/api/admin-response';

export const GET = withPlatformAdmin(async () => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' },
      include: { _count: { select: { tenants: true, subscriptions: true } } },
    });

    return adminOk({
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: Number(p.price),
        billingCycle: p.billingCycle,
        maxUsers: p.maxUsers,
        maxForms: p.maxForms,
        maxPipelines: p.maxPipelines,
        maxLeadsPerMonth: p.maxLeadsPerMonth,
        canUseReports: p.canUseReports,
        canExportCsv: p.canExportCsv,
        canUseCustomBranding: p.canUseCustomBranding,
        canUseMetaPixel: p.canUseMetaPixel,
        canUseWebhooks: p.canUseWebhooks,
        canUseTasks: p.canUseTasks,
        isActive: p.isActive,
        tenantsCount: p._count.tenants,
        subscriptionsCount: p._count.subscriptions,
      })),
    });
  } catch (error: any) {
    console.error('[admin/plans][GET]', { message: error?.message, code: error?.code, meta: error?.meta, stack: error?.stack });
    return adminError('Falha ao carregar planos.', 500, { code: 'ADMIN_PLANS_LOAD_FAILED', prismaCode: error?.code });
  }
});
